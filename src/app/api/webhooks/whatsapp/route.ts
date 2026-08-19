import { MessageDeliveryStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { logger } from '../../../../lib/logger';
import { logAudit } from '../../../../features/auth/audit';
import { handleIncomingMessage } from '../../../../features/ai/agent';
import { verifyWebhookSignature } from '../../../../features/whatsapp/signature';
import { getWhatsAppVerifyToken } from '../../../../features/whatsapp/config';
import {
  parseWebhookPayload,
  extractInboundMessages,
  extractStatusUpdates,
  isMediaMessage,
  type WhatsAppTextMessage,
} from '../../../../features/whatsapp/webhook-events';
import { resolveBusinessFromPhoneNumberId } from '../../../../features/whatsapp/phone-mapping';
import { resolveCustomerIdentity } from '../../../../features/whatsapp/customer-identity';
import { sendWhatsAppReply } from '../../../../features/whatsapp/send';

const CHANNEL = 'whatsapp';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode !== 'subscribe' || !token || !challenge) {
    return NextResponse.json({ error: 'Invalid verification request' }, { status: 403 });
  }

  try {
    const verifyToken = getWhatsAppVerifyToken();
    if (token !== verifyToken) {
      return NextResponse.json({ error: 'Invalid verify token' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Verify token not configured' }, { status: 500 });
  }

  logger.info('whatsapp.webhook.verified', { mode });

  return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  const signatureHeader = request.headers.get('X-Hub-Signature-256');
  if (!verifyWebhookSignature(rawBody, signatureHeader)) {
    logger.warn('whatsapp.webhook.signature_invalid');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let payload;
  try {
    payload = parseWebhookPayload(parsed);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // TODO (M4 – outbox): Per integrations.md, durable business effects should
  // be enqueued as outbox work items rather than processed inline. The current
  // fire-and-forget pattern is an MVP limitation; replace with an outbox
  // table or message queue before production scaling.

  // TODO (M5 – rate limiting): Per security.md, webhook endpoints MUST be
  // rate-limited using a shared production-safe backing store. Implement
  // rate limiting per phone_number_id before production deployment.

  const webhookPromise = (async () => {
    try {
      for (const entry of payload.entry) {
        const inboundMessages = extractInboundMessages(entry);
        const statusUpdates = extractStatusUpdates(entry);

        for (const { message, phoneNumberId } of inboundMessages) {
          let businessId: string;
          try {
            const business = await resolveBusinessFromPhoneNumberId(phoneNumberId);
            businessId = business.businessId;
          } catch {
            logger.warn('whatsapp.webhook.unknown_business', { phoneNumberId });
            continue;
          }

          // H1: Atomic upsert prevents duplicate conversations from concurrent webhooks.

          const contactName =
            entry.changes[0]?.value.contacts?.[0]?.profile?.name;

          const identity = await resolveCustomerIdentity(
            businessId,
            (message as { from: string }).from,
            contactName,
          );

          const conversation = await prisma.conversation.upsert({
            where: {
              businessId_customerId_channel: {
                businessId,
                customerId: identity.customerId,
                channel: CHANNEL,
              },
            },
            update: {},
            create: {
              businessId,
              customerId: identity.customerId,
              channel: CHANNEL,
              status: 'ACTIVE',
              controlState: 'AI_CONTROLLED',
            },
            select: { id: true, controlState: true },
          });

          // B2: Media messages persisted after conversation resolution with valid conversationId.
          if (message.type !== 'text') {
            if (isMediaMessage(message)) {
              await prisma.message.create({
                data: {
                  businessId,
                  conversationId: conversation.id,
                  authorType: 'CUSTOMER',
                  direction: 'INBOUND',
                  status: 'SENT',
                  channel: CHANNEL,
                  providerMessageId: message.id,
                  body: `[Media: ${message.type}]`,
                },
              }).catch(() => {});
            }
            continue;
          }

          const textMessage = message as WhatsAppTextMessage;

          try {
            await prisma.message.create({
              data: {
                businessId,
                conversationId: conversation.id,
                authorType: 'CUSTOMER',
                direction: 'INBOUND',
                status: 'SENT',
                channel: CHANNEL,
                providerMessageId: textMessage.id,
                body: textMessage.text.body,
              },
            });
          } catch (error) {
            if (
              error instanceof Error &&
              'code' in error &&
              (error as { code: string }).code === 'P2002'
            ) {
              logger.info('whatsapp.webhook.duplicate_message', {
                businessId,
                providerMessageId: textMessage.id,
              });
              continue;
            }
            throw error;
          }

          // H3: Conditional update prevents stale lastInboundAt from overwriting a fresher value.
          const now = new Date();
          await prisma.$executeRaw`
            UPDATE "Conversation"
            SET "lastInboundAt" = ${now}, "updatedAt" = ${now}
            WHERE id = ${conversation.id}
              AND ("lastInboundAt" IS NULL OR "lastInboundAt" < ${now})
          `;

          await logAudit({
            businessId,
            eventType: 'WHATSAPP_MESSAGE_RECEIVED',
            actorType: 'USER',
            actorId: identity.customerId,
            payload: {
              conversationId: conversation.id,
              providerMessageId: textMessage.id,
              from: textMessage.from,
            },
          });

          if (conversation.controlState === 'AI_CONTROLLED') {
            try {
              const agentResult = await handleIncomingMessage({
                businessId,
                conversationId: conversation.id,
                customerId: identity.customerId,
                messageBody: textMessage.text.body,
              });

              if (agentResult.reply) {
                await sendWhatsAppReply({
                  businessId,
                  conversationId: conversation.id,
                  customerId: identity.customerId,
                  replyText: agentResult.reply,
                });
              }
            } catch (error) {
              logger.error('whatsapp.webhook.ai_invocation_failed', {
                businessId,
                conversationId: conversation.id,
                error: error instanceof Error ? error.message : 'unknown',
              });
            }
          }
        }

        // M2: Process delivery/read/failed status updates from Meta.
        for (const { status, phoneNumberId } of statusUpdates) {
          let businessId: string;
          try {
            const business = await resolveBusinessFromPhoneNumberId(phoneNumberId);
            businessId = business.businessId;
          } catch {
            continue;
          }

          const statusMap: Record<string, MessageDeliveryStatus> = {
            sent: MessageDeliveryStatus.SENT,
            delivered: MessageDeliveryStatus.DELIVERED,
            read: MessageDeliveryStatus.DELIVERED,
            failed: MessageDeliveryStatus.FAILED,
            played: MessageDeliveryStatus.DELIVERED,
          };
          const deliveryStatus = statusMap[status.status] ?? MessageDeliveryStatus.SENT;

          try {
            await prisma.message.updateMany({
              where: {
                businessId,
                providerMessageId: status.id,
              },
              data: { status: deliveryStatus },
            });
          } catch {
            logger.warn('whatsapp.webhook.status_update_failed', {
              statusId: status.id,
            });
          }
        }
      }
    } catch (error) {
      logger.error('whatsapp.webhook.processing_error', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  })();

  webhookPromise.catch((error) => {
    logger.error('whatsapp.webhook.unhandled', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  });

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
