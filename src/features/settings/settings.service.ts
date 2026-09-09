import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { logAudit } from '../auth/audit';

const SETTINGS_SCOPE = 'business_admin' as const;

export interface UpdateBusinessSettingsInput {
  notificationConfig?: Record<string, unknown>;
}

/**
 * Update business settings for the caller's business.
 *
 * Merge is used rather than replace: notificationConfig may contain channel
 * connection state (whatsapp/instagram/facebook) that must be preserved when
 * only the top-level notification preferences change.
 */
export async function updateBusinessSettings(
  userId: string,
  requestedBusinessId: string,
  input: UpdateBusinessSettingsInput,
) {
  const membership = await requireScope(userId, requestedBusinessId, SETTINGS_SCOPE);

  const existing = await prisma.businessSettings.findUnique({
    where: { businessId: membership.businessId },
    select: { notificationConfig: true },
  });

  const mergedNotificationConfig = {
    ...((existing?.notificationConfig as Record<string, unknown>) ?? {}),
    ...(input.notificationConfig ?? {}),
  };

  const settings = await prisma.businessSettings.upsert({
    where: { businessId: membership.businessId },
    create: {
      businessId: membership.businessId,
      notificationConfig: mergedNotificationConfig as Prisma.InputJsonValue,
    },
    update: {
      notificationConfig: mergedNotificationConfig as Prisma.InputJsonValue,
    },
  });

  await logAudit({
    businessId: membership.businessId,
    eventType: 'BUSINESS_SETTINGS_UPDATED',
    actorType: 'USER',
    actorId: userId,
    payload: {
      changedFields: Object.keys(input),
    },
  });

  return settings;
}