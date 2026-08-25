import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../lib/env';
import { AppError } from '../../lib/errors';
import { logAudit } from '../auth/audit';
import { requireScope } from '../auth/authorization';
import { verifyMetaAccount } from './meta-graph';
import { parseConnectWhatsAppInput } from './validation';

const SETTINGS_SCOPE = 'business_admin' as const;

export interface WhatsAppConnectionStatus {
  connected: boolean;
  displayPhoneNumber?: string;
  connectedAt?: string;
}

interface StoredWhatsAppConfig {
  phoneNumberId?: string;
  accessToken?: string;
  businessAccountId?: string;
  displayPhoneNumber?: string;
  connectedAt?: string;
}

function readStoredConfig(
  notificationConfig: unknown,
): StoredWhatsAppConfig | undefined {
  return (notificationConfig as Record<string, unknown> | null)?.whatsapp as
    | StoredWhatsAppConfig
    | undefined;
}

export async function getWhatsAppConnection(
  businessId: string,
): Promise<WhatsAppConnectionStatus> {
  const settings = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { notificationConfig: true },
  });

  const stored = readStoredConfig(settings?.notificationConfig);
  if (!stored?.phoneNumberId) {
    return { connected: false };
  }

  return {
    connected: true,
    ...(stored.displayPhoneNumber
      ? { displayPhoneNumber: stored.displayPhoneNumber }
      : {}),
    ...(stored.connectedAt ? { connectedAt: stored.connectedAt } : {}),
  };
}

export async function connectWhatsApp(
  userId: string,
  businessId: string,
  input: unknown,
): Promise<WhatsAppConnectionStatus> {
  await requireScope(userId, businessId, SETTINGS_SCOPE);
  const data = parseConnectWhatsAppInput(input);

  const accessToken =
    data.accessToken ?? env.WHATSAPP_ACCESS_TOKEN ?? undefined;
  if (!accessToken) {
    throw new AppError(
      'VALIDATION_ERROR',
      'An access token is required because no system WhatsApp token is configured.',
    );
  }

  const meta = await verifyMetaAccount(
    data.phoneNumberId,
    accessToken,
    ['id', 'display_phone_number'],
  );

  const clash = await prisma.businessSettings.findFirst({
    where: {
      businessId: { not: businessId },
      notificationConfig: {
        path: ['whatsapp', 'phoneNumberId'],
        equals: data.phoneNumberId,
      },
    },
    select: { businessId: true },
  });
  if (clash) {
    throw new AppError(
      'VALIDATION_ERROR',
      'This WhatsApp number is already connected to another OrderAId account.',
    );
  }

  const existing = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { notificationConfig: true },
  });

  const mergedConfig = {
    ...((existing?.notificationConfig as Record<string, unknown>) ?? {}),
  };
  const whatsapp: Record<string, unknown> = {
    phoneNumberId: data.phoneNumberId,
    displayPhoneNumber: meta.display_phone_number ?? undefined,
    connectedAt: new Date().toISOString(),
  };
  if (data.accessToken) whatsapp.accessToken = data.accessToken;
  if (data.businessAccountId) whatsapp.businessAccountId = data.businessAccountId;
  mergedConfig.whatsapp = whatsapp;

  await prisma.businessSettings.upsert({
    where: { businessId },
    create: {
      businessId,
      notificationConfig: mergedConfig as Prisma.InputJsonValue,
    },
    update: {
      notificationConfig: mergedConfig as Prisma.InputJsonValue,
    },
  });

  await logAudit({
    businessId,
    eventType: 'WHATSAPP_CONNECTED',
    actorType: 'USER',
    actorId: userId,
    payload: {
      phoneNumberId: data.phoneNumberId,
      businessAccountId: data.businessAccountId,
      usedSystemToken: !data.accessToken,
    },
  });

  return getWhatsAppConnection(businessId);
}

export async function disconnectWhatsApp(
  userId: string,
  businessId: string,
): Promise<WhatsAppConnectionStatus> {
  await requireScope(userId, businessId, SETTINGS_SCOPE);

  const existing = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { notificationConfig: true },
  });

  if (readStoredConfig(existing?.notificationConfig)?.phoneNumberId) {
    const mergedConfig = {
      ...((existing?.notificationConfig as Record<string, unknown>) ?? {}),
    };
    delete mergedConfig.whatsapp;

    await prisma.businessSettings.update({
      where: { businessId },
      data: {
        notificationConfig: mergedConfig as Prisma.InputJsonValue,
      },
    });

    await logAudit({
      businessId,
      eventType: 'WHATSAPP_DISCONNECTED',
      actorType: 'USER',
      actorId: userId,
    });
  }

  return { connected: false };
}
