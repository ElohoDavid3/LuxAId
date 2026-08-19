import { prisma } from '../../lib/prisma';
import { env } from '../../lib/env';
import { AppError } from '../../lib/errors';

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  businessAccountId?: string;
  verifyToken?: string;
  replyTemplateName?: string;
}

/**
 * Resolve WhatsApp credentials for a business.
 *
 * Priority:
 * 1. Per-business credentials in BusinessSettings.notificationConfig.whatsapp
 * 2. System-level WHATSAPP_ACCESS_TOKEN from env (MVP fallback)
 *
 * The WHATSAPP_APP_SECRET and WHATSAPP_VERIFY_TOKEN are always system-level
 * (env-only) because they authenticate the webhook, not a specific business.
 */
export async function getWhatsAppConfig(
  businessId: string,
): Promise<WhatsAppConfig> {
  const settings = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { notificationConfig: true },
  });

  const whatsappConfig = (settings?.notificationConfig as Record<string, unknown> | null)
    ?.whatsapp as Record<string, unknown> | undefined;

  const phoneNumberId = whatsappConfig?.phoneNumberId as string | undefined;
  if (!phoneNumberId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'WhatsApp phone number ID is not configured for this business.',
    );
  }

  const accessToken =
    (whatsappConfig?.accessToken as string | undefined) ??
    env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new AppError(
      'INTEGRATION_FAILURE',
      'WhatsApp access token is not available.',
    );
  }

  return {
    phoneNumberId,
    accessToken,
    businessAccountId: whatsappConfig?.businessAccountId as string | undefined,
    verifyToken: env.WHATSAPP_VERIFY_TOKEN,
    replyTemplateName: (
      whatsappConfig?.templates as Record<string, unknown> | undefined
    )?.reply as string | undefined,
  };
}

/**
 * Get the system-level WhatsApp app secret for webhook signature verification.
 */
export function getWhatsAppAppSecret(): string {
  if (!env.WHATSAPP_APP_SECRET) {
    throw new AppError(
      'INTEGRATION_FAILURE',
      'WhatsApp app secret is not configured.',
    );
  }
  return env.WHATSAPP_APP_SECRET;
}

/**
 * Get the system-level verify token for subscription challenge verification.
 */
export function getWhatsAppVerifyToken(): string {
  if (!env.WHATSAPP_VERIFY_TOKEN) {
    throw new AppError(
      'INTEGRATION_FAILURE',
      'WhatsApp verify token is not configured.',
    );
  }
  return env.WHATSAPP_VERIFY_TOKEN;
}
