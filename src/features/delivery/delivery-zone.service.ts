import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { Prisma } from '@prisma/client';

const ORDERS_SCOPE = 'orders' as const;

async function resolveMembership(userId: string, requestedBusinessId: string) {
  return requireScope(userId, requestedBusinessId, ORDERS_SCOPE);
}

export type DeliveryZoneRecord = Prisma.DeliveryZoneGetPayload<
  Record<string, never>
>;

export async function listDeliveryZones(
  userId: string,
  requestedBusinessId: string,
): Promise<DeliveryZoneRecord[]> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  return prisma.deliveryZone.findMany({
    where: { businessId: membership.businessId },
    orderBy: { name: 'asc' },
  });
}
