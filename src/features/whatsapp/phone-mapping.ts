import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';

/**
 * Resolve a WhatsApp phone_number_id to the owning business.
 *
 * Searches BusinessSettings.notificationConfig JSON for a WhatsApp config
 * object where `whatsapp.phoneNumberId` matches the incoming value.
 * This is a tenant-scoped lookup: the phone_number_id must belong to
 * exactly one business.
 */
export async function resolveBusinessFromPhoneNumberId(
  phoneNumberId: string,
): Promise<{ businessId: string; businessName: string }> {
  const settings = await prisma.businessSettings.findFirst({
    where: {
      notificationConfig: {
        path: ['whatsapp', 'phoneNumberId'],
        equals: phoneNumberId,
      },
    },
    select: {
      businessId: true,
      business: { select: { name: true } },
    },
  });

  if (!settings) {
    logger.warn('whatsapp.phone_mapping.unknown_number', { phoneNumberId });
    throw new AppError(
      'VALIDATION_ERROR',
      'No business is configured for this phone number.',
    );
  }

  return {
    businessId: settings.businessId,
    businessName: settings.business.name,
  };
}
