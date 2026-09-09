import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../lib/env';
import { AppError } from '../../lib/errors';
import { logAudit } from '../auth/audit';
import { requireScope } from '../auth/authorization';
import { verifyMetaAccount } from './meta-graph';
import { parseConnectFacebookInput } from './validation';

const SETTINGS_SCOPE = 'business_admin' as const;

export interface FacebookConnectionStatus {
  connected: boolean;
  pageName?: string;
  pageId?: string;
  connectedAt?: string;
}

interface StoredFacebookConfig {
  pageId?: string;
  accessToken?: string;
  pageName?: string;
  connectedAt?: string;
}

function readStoredConfig(
  notificationConfig: unknown,
): StoredFacebookConfig | undefined {
  return (notificationConfig as Record<string, unknown> | null)?.facebook as
    | StoredFacebookConfig
    | undefined;
}

export async function getFacebookConnection(
  userId: string,
  businessId: string,
): Promise<FacebookConnectionStatus> {
  await requireScope(userId, businessId, SETTINGS_SCOPE);

  const settings = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { notificationConfig: true },
  });

  const stored = readStoredConfig(settings?.notificationConfig);
  if (!stored?.pageId) {
    return { connected: false };
  }

  return {
    connected: true,
    ...(stored.pageName ? { pageName: stored.pageName } : {}),
    ...(stored.pageId ? { pageId: stored.pageId } : {}),
    ...(stored.connectedAt ? { connectedAt: stored.connectedAt } : {}),
  };
}

export async function connectFacebook(
  userId: string,
  businessId: string,
  input: unknown,
): Promise<FacebookConnectionStatus> {
  await requireScope(userId, businessId, SETTINGS_SCOPE);
  const data = parseConnectFacebookInput(input);

  const accessToken =
    data.accessToken ?? env.FACEBOOK_ACCESS_TOKEN ?? undefined;
  if (!accessToken) {
    throw new AppError(
      'VALIDATION_ERROR',
      'An access token is required because no system Facebook token is configured.',
    );
  }

  const meta = await verifyMetaAccount(data.pageId, accessToken, [
    'id',
    'name',
  ]);

  const clash = await prisma.businessSettings.findFirst({
    where: {
      businessId: { not: businessId },
      notificationConfig: {
        path: ['facebook', 'pageId'],
        equals: data.pageId,
      },
    },
    select: { businessId: true },
  });
  if (clash) {
    throw new AppError(
      'VALIDATION_ERROR',
      'This Facebook Page is already connected to another OrderAId account.',
    );
  }

  const existing = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { notificationConfig: true },
  });

  const mergedConfig = {
    ...((existing?.notificationConfig as Record<string, unknown>) ?? {}),
  };
  const facebook: Record<string, unknown> = {
    pageId: data.pageId,
    pageName: meta.name ?? undefined,
    connectedAt: new Date().toISOString(),
  };
  if (data.accessToken) facebook.accessToken = data.accessToken;
  mergedConfig.facebook = facebook;

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
    eventType: 'FACEBOOK_CONNECTED',
    actorType: 'USER',
    actorId: userId,
    payload: {
      pageId: data.pageId,
      usedSystemToken: !data.accessToken,
    },
  });

  return getFacebookConnection(userId, businessId);
}

export async function disconnectFacebook(
  userId: string,
  businessId: string,
): Promise<FacebookConnectionStatus> {
  await requireScope(userId, businessId, SETTINGS_SCOPE);

  const existing = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { notificationConfig: true },
  });

  if (readStoredConfig(existing?.notificationConfig)?.pageId) {
    const mergedConfig = {
      ...((existing?.notificationConfig as Record<string, unknown>) ?? {}),
    };
    delete mergedConfig.facebook;

    await prisma.businessSettings.update({
      where: { businessId },
      data: {
        notificationConfig: mergedConfig as Prisma.InputJsonValue,
      },
    });

    await logAudit({
      businessId,
      eventType: 'FACEBOOK_DISCONNECTED',
      actorType: 'USER',
      actorId: userId,
    });
  }

  return { connected: false };
}