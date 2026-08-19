import { ConversationControlState } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { logAudit } from '../auth/audit';
import { resolveSystemUser } from '../ai/system-user';
import {
  sendTextMessage,
  sendTemplateMessage,
} from './client';
import { getWhatsAppConfig } from './config';

const FREE_FORM_WINDOW_MS = 24 * 60 * 60 * 1000;

interface SendReplyParams {
  businessId: string;
  conversationId: string;
  customerId: string;
  replyText: string;
}

/**
 * Send an AI-generated reply back to the customer via WhatsApp.
 *
 * Checks:
 * 1. Customer consent — skip if OPTED_OUT
 * 2. Conversation control state — skip if not AI_CONTROLLED
 * 3. 24-hour service window — free-form if within window, template otherwise
 *
 * Persists the outbound message with direction=OUTBOUND and providerMessageId.
 */
export async function sendWhatsAppReply(
  params: SendReplyParams,
): Promise<void> {
  const { businessId, conversationId, customerId, replyText } = params;

  if (!replyText || replyText.trim().length === 0) return;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
    select: { id: true, consentStatus: true, phone: true },
  });

  if (!customer) {
    logger.warn('whatsapp.send.customer_not_found', {
      businessId,
      customerId,
    });
    return;
  }

  if (customer.consentStatus === 'OPTED_OUT') {
    logger.info('whatsapp.send.customer_opted_out', {
      businessId,
      customerId,
    });
    return;
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId },
    select: { id: true, controlState: true, lastInboundAt: true },
  });

  if (!conversation) {
    logger.warn('whatsapp.send.conversation_not_found', {
      businessId,
      conversationId,
    });
    return;
  }

  // Defense-in-depth: webhook and agent also check controlState,
  // but we re-verify here to guard against TOCTOU races.
  if (conversation.controlState !== ConversationControlState.AI_CONTROLLED) {
    logger.info('whatsapp.send.suppressed_not_ai_controlled', {
      businessId,
      conversationId,
      controlState: conversation.controlState,
    });
    return;
  }

  if (!customer.phone) {
    logger.warn('whatsapp.send.no_phone', { businessId, customerId });
    return;
  }

  let providerMessageId = '';

  try {
    const config = await getWhatsAppConfig(businessId);
    const withinWindow =
      conversation.lastInboundAt &&
      Date.now() - conversation.lastInboundAt.getTime() < FREE_FORM_WINDOW_MS;

    if (withinWindow) {
      const result = await sendTextMessage({
        businessId,
        phoneNumberId: config.phoneNumberId,
        accessToken: config.accessToken,
        to: customer.phone,
        conversationId,
        text: replyText,
      });
      providerMessageId = result.providerMessageId;
    } else {
      const result = await sendTemplateMessage({
        businessId,
        phoneNumberId: config.phoneNumberId,
        accessToken: config.accessToken,
        to: customer.phone,
        templateName: config.replyTemplateName || 'orderaid_reply',
        languageCode: 'en_US',
        parameters: [{ type: 'text', text: replyText }],
      });
      providerMessageId = result.providerMessageId;
    }
  } catch {
    logger.error('whatsapp.send.failed', {
      businessId,
      conversationId,
      customerId,
    });
    throw new AppError(
      'INTEGRATION_FAILURE',
      'Failed to send WhatsApp reply.',
    );
  }

  try {
    const systemUser = await resolveSystemUser(businessId);
    await prisma.message.create({
      data: {
        businessId,
        conversationId,
        authorType: 'AI',
        direction: 'OUTBOUND',
        status: 'SENT',
        channel: 'whatsapp',
        providerMessageId: providerMessageId || undefined,
        body: replyText,
      },
    });

    await logAudit({
      businessId,
      eventType: 'WHATSAPP_OUTBOUND_SENT',
      actorType: 'AI',
      actorId: systemUser.userId,
      payload: {
        conversationId,
        customerId,
        providerMessageId,
        replyLength: replyText.length,
      },
    });
  } catch {
    logger.warn('whatsapp.send.system_user_missing', { businessId });
  }
}
