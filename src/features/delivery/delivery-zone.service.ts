import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { logAudit } from '../auth/audit';
import { AppError } from '../../lib/errors';
import { Prisma } from '@prisma/client';
import {
  createDeliveryZoneSchema,
  updateDeliveryZoneSchema,
  parseOrThrow,
} from './validation';

const ORDERS_SCOPE = 'orders' as const;
const ADMIN_SCOPE = 'business_admin' as const;

async function resolveMembership(userId: string, requestedBusinessId: string) {
  return requireScope(userId, requestedBusinessId, ORDERS_SCOPE);
}

async function resolveAdminMembership(
  userId: string,
  requestedBusinessId: string,
) {
  return requireScope(userId, requestedBusinessId, ADMIN_SCOPE);
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

export async function createDeliveryZone(
  userId: string,
  requestedBusinessId: string,
  input: unknown,
): Promise<DeliveryZoneRecord> {
  const membership = await resolveAdminMembership(userId, requestedBusinessId);
  const data = parseOrThrow(createDeliveryZoneSchema, input);

  const zone = await prisma.deliveryZone.create({
    data: {
      businessId: membership.businessId,
      name: data.name,
      fee: data.fee,
      coverage: data.coverage,
    },
  });

  await logAudit({
    businessId: membership.businessId,
    eventType: 'DELIVERY_ZONE_CREATED',
    actorId: userId,
    actorType: 'USER',
    payload: { zoneId: zone.id, name: zone.name, fee: zone.fee },
  });

  return zone;
}

export async function updateDeliveryZone(
  userId: string,
  requestedBusinessId: string,
  zoneId: string,
  input: unknown,
): Promise<DeliveryZoneRecord> {
  const membership = await resolveAdminMembership(userId, requestedBusinessId);
  const data = parseOrThrow(updateDeliveryZoneSchema, input);

  const existing = await prisma.deliveryZone.findFirst({
    where: { id: zoneId, businessId: membership.businessId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError('UNKNOWN_DELIVERY_ZONE', 'Delivery zone not found.');
  }

  const zone = await prisma.deliveryZone.update({
    where: { id: existing.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.fee !== undefined ? { fee: data.fee } : {}),
      ...(data.coverage !== undefined ? { coverage: data.coverage } : {}),
    },
  });

  await logAudit({
    businessId: membership.businessId,
    eventType: 'DELIVERY_ZONE_UPDATED',
    actorId: userId,
    actorType: 'USER',
    payload: { zoneId: zone.id, fields: Object.keys(data) },
  });

  return zone;
}

export async function deleteDeliveryZone(
  userId: string,
  requestedBusinessId: string,
  zoneId: string,
): Promise<void> {
  const membership = await resolveAdminMembership(userId, requestedBusinessId);

  const existing = await prisma.deliveryZone.findFirst({
    where: { id: zoneId, businessId: membership.businessId },
    select: { id: true, name: true },
  });
  if (!existing) {
    throw new AppError('UNKNOWN_DELIVERY_ZONE', 'Delivery zone not found.');
  }

  await prisma.deliveryZone.delete({ where: { id: existing.id } });

  await logAudit({
    businessId: membership.businessId,
    eventType: 'DELIVERY_ZONE_DELETED',
    actorId: userId,
    actorType: 'USER',
    payload: { zoneId: existing.id, name: existing.name },
  });
}
