import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../lib/env';
import { AppError } from '../../lib/errors';
import { logAudit } from '../auth/audit';
import { requireScope } from '../auth/authorization';
import { verifyMetaAccount } from './meta-graph';
import { parseConnectInstagramInput } from './validation';

const SETTINGS_SCOPE = 'business_admin' as const;

export interface InstagramConnectionStatus {
  connected: boolean;
  username?: string;
  connectedAt?: string;
}

interface StoredInstagramConfig {
  instagramAccountId?: string;
  accessToken?: string;
  username?: string;
  connectedAt?: string;
}

function readStoredConfig(
  notificationConfig: unknown,
): StoredInstagramConfig | undefined {
  return (notificationConfig as Record<string, unknown> | null)?.instagram as
    | StoredInstagramConfig
    | undefined;
}

export async function getInstagramConnection(
  businessId: string,
): Promise<InstagramConnectionStatus> {
  const settings = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { notificationConfig: true },
  });

  const stored = readStoredConfig(settings?.notificationConfig);
  if (!stored?.instagramAccountId) {
    return { connected: false };
  }

  return {
    connected: true,
    ...(stored.username ? { username: stored.username } : {}),
    ...(stored.connectedAt ? { connectedAt: stored.connectedAt } : {}),
  };
}

export async function connectInstagram(
  userId: string,
  businessId: string,
  input: unknown,
): Promise<InstagramConnectionStatus> {
  await requireScope(userId, businessId, SETTINGS_SCOPE);
  const data = parseConnectInstagramInput(input);

  const accessToken =
    data.accessToken ?? env.WHATSAPP_ACCESS_TOKEN ?? undefined;
  if (!accessToken) {
    throw new AppError(
      'VALIDATION_ERROR',
      'An access token is required because no system Meta token is configured.',
    );
  }

  const meta = await verifyMetaAccount(
    data.instagramAccountId,
    accessToken,
    ['id', 'username'],
  );

  const clash = await prisma.businessSettings.findFirst({
    where: {
      businessId: { not: businessId },
      notificationConfig: {
        path: ['instagram', 'instagramAccountId'],
        equals: data.instagramAccountId,
      },
    },
    select: { businessId: true },
  });
  if (clash) {
    throw new AppError(
      'VALIDATION_ERROR',
      'This Instagram account is already connected to another OrderAId account.',
    );
  }

  const existing = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { notificationConfig: true },
  });

  const mergedConfig = {
    ...((existing?.notificationConfig as Record<string, unknown>) ?? {}),
  };
  const instagram: Record<string, unknown> = {
    instagramAccountId: data.instagramAccountId,
    username: meta.username ?? undefined,
    connectedAt: new Date().toISOString(),
  };
  if (data.accessToken) instagram.accessToken = data.accessToken;
  mergedConfig.instagram = instagram;

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
    eventType: 'INSTAGRAM_CONNECTED',
    actorType: 'USER',
    actorId: userId,
    payload: {
      instagramAccountId: data.instagramAccountId,
      usedSystemToken: !data.accessToken,
    },
  });

  return getInstagramConnection(businessId);
}

export async function disconnectInstagram(
  userId: string,
  businessId: string,
): Promise<InstagramConnectionStatus> {
  await requireScope(userId, businessId, SETTINGS_SCOPE);

  const existing = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { notificationConfig: true },
  });

  if (readStoredConfig(existing?.notificationConfig)?.instagramAccountId) {
    const mergedConfig = {
      ...((existing?.notificationConfig as Record<string, unknown>) ?? {}),
    };
    delete mergedConfig.instagram;

    await prisma.businessSettings.update({
      where: { businessId },
      data: {
        notificationConfig: mergedConfig as Prisma.InputJsonValue,
      },
    });

    await logAudit({
      businessId,
      eventType: 'INSTAGRAM_DISCONNECTED',
      actorType: 'USER',
      actorId: userId,
    });
  }

  return { connected: false };
}
