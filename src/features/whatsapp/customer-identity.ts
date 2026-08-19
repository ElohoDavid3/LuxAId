import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

const CHANNEL = 'whatsapp';

/**
 * Resolve a WhatsApp phone number to a CustomerChannelIdentity → Customer.
 *
 * Uses the stable channel identifier (phone number) as the identity key.
 * If no identity exists, a new customer is created with consentStatus UNKNOWN.
 *
 * The lookup is strictly tenant-scoped: the phone number is resolved within
 * the given businessId only.
 */
export async function resolveCustomerIdentity(
  businessId: string,
  whatsappPhone: string,
  profileName?: string,
): Promise<{
  customerId: string;
  customerName: string;
  channelIdentityId: string;
  isNew: boolean;
}> {
  const existing = await prisma.customerChannelIdentity.findUnique({
    where: {
      businessId_channel_channelId: {
        businessId,
        channel: CHANNEL,
        channelId: whatsappPhone,
      },
    },
    select: {
      id: true,
      customer: {
        select: { id: true, name: true },
      },
    },
  });

  if (existing) {
    return {
      customerId: existing.customer.id,
      customerName: existing.customer.name,
      channelIdentityId: existing.id,
      isNew: false,
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        businessId,
        name: profileName || `Customer ${whatsappPhone.slice(-4)}`,
        phone: whatsappPhone,
        consentStatus: 'UNKNOWN',
      },
      select: { id: true, name: true },
    });

    const channelIdentity = await tx.customerChannelIdentity.create({
      data: {
        businessId,
        customerId: customer.id,
        channel: CHANNEL,
        channelId: whatsappPhone,
      },
      select: { id: true },
    });

    return {
      customerId: customer.id,
      customerName: customer.name,
      channelIdentityId: channelIdentity.id,
      isNew: true,
    };
  });

  logger.info('whatsapp.customer.created', {
    businessId,
    customerId: result.customerId,
    isNew: true,
  });

  return result;
}
