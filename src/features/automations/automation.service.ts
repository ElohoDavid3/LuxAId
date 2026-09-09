import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { Prisma, OrderStatus } from '@prisma/client';
import { sendTemplateMessage } from '../whatsapp/client';
import { getWhatsAppConfig } from '../whatsapp/config';

const AUTOMATIONS_SCOPE = 'business_admin' as const;

async function resolveMembership(userId: string, requestedBusinessId: string) {
  return requireScope(userId, requestedBusinessId, AUTOMATIONS_SCOPE);
}

export async function listAutomations(userId: string, requestedBusinessId: string) {
  const membership = await resolveMembership(userId, requestedBusinessId);
  return prisma.automation.findMany({
    where: { businessId: membership.businessId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createAutomation(
  userId: string,
  requestedBusinessId: string,
  input: { name: string; trigger: Record<string, unknown>; action: Record<string, unknown> },
) {
  const membership = await resolveMembership(userId, requestedBusinessId);
  return prisma.automation.create({
    data: {
      businessId: membership.businessId,
      name: input.name,
      trigger: input.trigger as Prisma.InputJsonValue,
      action: input.action as Prisma.InputJsonValue,
      enabled: true,
    },
  });
}

export async function toggleAutomation(
  userId: string,
  requestedBusinessId: string,
  id: string,
  enabled: boolean,
) {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const existing = await prisma.automation.findFirst({
    where: { id, businessId: membership.businessId },
  });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Automation not found.');
  }

  return prisma.automation.update({
    where: { id },
    data: { enabled },
  });
}

const RECOVERY_NOTIFICATION_SUBJECT = 'ABANDONED_ORDER_RECOVERY';
const RECOVERY_TRIGGER = 'abandoned_order';

async function getOrCreateRecoveryAutomation(businessId: string) {
  const existing = await prisma.automation.findFirst({
    where: {
      businessId,
      trigger: {
        path: ['type'],
        equals: RECOVERY_TRIGGER,
      },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.automation.create({
    data: {
      businessId,
      name: 'Abandoned order recovery',
      trigger: { type: RECOVERY_TRIGGER } as Prisma.InputJsonValue,
      action: {
        type: 'notify_whatsapp',
        template: 'abandoned_order_recovery',
      } as Prisma.InputJsonValue,
      enabled: true,
    },
  });
  return created.id;
}

async function createExecution(
  businessId: string,
  automationId: string,
  orderId: string,
  status: string,
  result?: Record<string, unknown>,
) {
  return prisma.automationExecution.create({
    data: {
      businessId,
      automationId,
      orderId,
      status,
      result: (result as Prisma.InputJsonValue) ?? undefined,
      completedAt: new Date(),
    },
  });
}

export async function processAbandonedOrderRecovery(businessId: string): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // Find orders in AWAITING_PAYMENT created more than 1 hour ago that haven't received recovery notification
  const abandonedOrders = await prisma.order.findMany({
    where: {
      businessId,
      status: OrderStatus.AWAITING_PAYMENT,
      createdAt: { lt: oneHourAgo },
      notifications: {
        none: {
          subject: RECOVERY_NOTIFICATION_SUBJECT,
          status: 'SENT',
        },
      },
    },
    include: {
      customer: true,
      items: { include: { product: true } },
    },
  });

  if (abandonedOrders.length === 0) return 0;

  let automationId: string;
  try {
    automationId = await getOrCreateRecoveryAutomation(businessId);
  } catch (error) {
    logger.error('automation.recovery.automation_lookup_failed', {
      businessId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError('INTERNAL_ERROR', 'Could not resolve the recovery automation.');
  }

  let processedCount = 0;

  for (const order of abandonedOrders) {
    if (!order.customer) {
      await createExecution(businessId, automationId, order.id, 'FAILED', {
        reason: 'missing_customer',
      });
      continue;
    }

    const itemNames = order.items.map((i) => i.product.name).join(', ');
    const recoveryMessage = `Hi ${order.customer.name}! We noticed you left item(s) (${itemNames}) in your cart. Would you like assistance completing your payment?`;

    const notification = await prisma.notification.create({
      data: {
        businessId,
        customerId: order.customerId,
        orderId: order.id,
        channel: 'whatsapp',
        status: 'PENDING',
        subject: RECOVERY_NOTIFICATION_SUBJECT,
        body: recoveryMessage,
      },
    });

    // Recovery is a business-initiated outbound message; it must use a
    // WhatsApp template (outbound free-form text is only allowed inside the
    // 24-hour customer service window). sendWhatsAppReply is not suitable here
    // because it is gated on AI_CONTROLLED conversations, which abandoned
    // orders typically are not.
    if (!order.customer.phone) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'FAILED' },
      });
      await createExecution(businessId, automationId, order.id, 'FAILED', {
        reason: 'customer_has_no_phone',
      });
      continue;
    }

    try {
      const config = await getWhatsAppConfig(businessId);
      const result = await sendTemplateMessage({
        businessId,
        phoneNumberId: config.phoneNumberId,
        accessToken: config.accessToken,
        to: order.customer.phone,
        templateName: config.replyTemplateName || 'abandoned_order_recovery',
        languageCode: 'en_US',
        parameters: [{ type: 'text', text: recoveryMessage }],
      });

      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      await createExecution(businessId, automationId, order.id, 'SUCCESS', {
        providerMessageId: result.providerMessageId,
      });

      processedCount += 1;
    } catch (error) {
      logger.warn('automation.recovery.send_failed', {
        businessId,
        orderId: order.id,
        error: error instanceof Error ? error.message : String(error),
      });

      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'FAILED' },
      });

      await createExecution(businessId, automationId, order.id, 'FAILED', {
        reason: 'whatsapp_send_failed',
      });
    }
  }

  return processedCount;
}
