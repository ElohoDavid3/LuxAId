import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { AppError } from '../../lib/errors';
import { Prisma } from '@prisma/client';
import {
  INVENTORY_MOVEMENT_REASONS as REASONS,
  INVENTORY_SOURCE_TYPES as SOURCES,
} from './inventory.constants';
import {
  checkAvailabilitySchema,
  manualAdjustmentSchema,
  orderInventoryOpSchema,
  parseOrThrow,
  setStockSchema,
} from './validation';
import { isUniqueConstraintViolation } from './errors';

const INVENTORY_SCOPE = 'products_inventory' as const;

async function resolveMembership(userId: string, requestedBusinessId: string) {
  return requireScope(userId, requestedBusinessId, INVENTORY_SCOPE);
}

export interface InventoryState {
  id: string;
  available: number;
  reserved: number;
  location: string | null;
}

export interface InventoryMutationResult {
  applied: boolean;
  alreadyApplied: boolean;
  inventory: InventoryState;
}

export interface AvailabilityResult {
  variantId: string;
  available: number;
  reserved: number;
  location: string | null;
  outOfStock: boolean;
  quantityAvailable: boolean;
}

interface ResolvedVariant {
  id: string;
  inventory: {
    id: string;
    available: number;
    reserved: number;
    location: string | null;
  };
}

async function resolveVariantWithInventory(
  businessId: string,
  variantId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<ResolvedVariant> {
  const variant = await client.productVariant.findFirst({
    where: { id: variantId, businessId },
    select: {
      id: true,
      inventory: {
        select: {
          id: true,
          available: true,
          reserved: true,
          location: true,
        },
      },
    },
  });
  if (!variant) {
    throw new AppError('UNKNOWN_PRODUCT', 'Variant not found.');
  }
  if (!variant.inventory) {
    throw new AppError(
      'INTERNAL_ERROR',
      'Variant inventory is missing; contact support.',
    );
  }
  return { id: variant.id, inventory: variant.inventory };
}

interface ConditionalOperation {
  businessId: string;
  inventoryId: string;
  sourceType: string;
  reason: string;
  sourceId: string;
  quantityDelta: number;
  updateWhere: Prisma.InventoryWhereInput;
  updateData: Prisma.InventoryUpdateManyMutationInput;
  insufficientMessage: string;
}

const inventorySelect = {
  id: true,
  available: true,
  reserved: true,
  location: true,
} satisfies Prisma.InventorySelect;

async function readInventory(
  client: Prisma.TransactionClient,
  inventoryId: string,
): Promise<InventoryState> {
  return client.inventory.findUniqueOrThrow({
    where: { id: inventoryId },
    select: inventorySelect,
  });
}

async function runConditionalOperation(
  op: ConditionalOperation,
): Promise<InventoryMutationResult> {
  const {
    businessId,
    inventoryId,
    sourceType,
    reason,
    sourceId,
    quantityDelta,
    updateWhere,
    updateData,
    insufficientMessage,
  } = op;
  const idempotencyKey = {
    inventoryId_reason_sourceId: { inventoryId, reason, sourceId },
  };
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryMovement.findUnique({
        where: idempotencyKey,
        select: { id: true },
      });
      if (existing) {
        return {
          applied: false,
          alreadyApplied: true,
          inventory: await readInventory(tx, inventoryId),
        };
      }
      const updated = await tx.inventory.updateMany({
        where: { id: inventoryId, businessId, ...updateWhere },
        data: updateData,
      });
      if (updated.count === 0) {
        throw new AppError('INSUFFICIENT_STOCK', insufficientMessage);
      }
      await tx.inventoryMovement.create({
        data: {
          businessId,
          inventoryId,
          quantityDelta,
          reason,
          sourceType,
          sourceId,
        },
      });
      return {
        applied: true,
        alreadyApplied: false,
        inventory: await readInventory(tx, inventoryId),
      };
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      const inventory = await prisma.inventory.findUniqueOrThrow({
        where: { id: inventoryId },
        select: inventorySelect,
      });
      return { applied: false, alreadyApplied: true, inventory };
    }
    throw error;
  }
}

export async function setStock(
  userId: string,
  requestedBusinessId: string,
  input: unknown,
): Promise<InventoryMutationResult> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(setStockSchema, input);
  const variant = await resolveVariantWithInventory(
    membership.businessId,
    data.variantId,
  );
  return runConditionalOperation({
    businessId: membership.businessId,
    inventoryId: variant.inventory.id,
    sourceType: SOURCES.VARIANT,
    reason: REASONS.IMPORT,
    sourceId: variant.id,
    quantityDelta: data.available,
    updateWhere: { available: { gte: 0 } },
    updateData: {
      available: { increment: data.available },
      ...(data.location !== undefined ? { location: data.location } : {}),
    },
    insufficientMessage: 'Cannot set negative stock.',
  });
}

export async function checkAvailability(
  userId: string,
  requestedBusinessId: string,
  input: unknown,
): Promise<AvailabilityResult> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(checkAvailabilitySchema, input);
  const variant = await resolveVariantWithInventory(
    membership.businessId,
    data.variantId,
  );
  return {
    variantId: variant.id,
    available: variant.inventory.available,
    reserved: variant.inventory.reserved,
    location: variant.inventory.location,
    outOfStock: variant.inventory.available === 0,
    quantityAvailable: variant.inventory.available >= data.quantity,
  };
}

export async function reserve(
  userId: string,
  requestedBusinessId: string,
  input: unknown,
): Promise<InventoryMutationResult> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(orderInventoryOpSchema, input);
  const variant = await resolveVariantWithInventory(
    membership.businessId,
    data.variantId,
  );
  return runConditionalOperation({
    businessId: membership.businessId,
    inventoryId: variant.inventory.id,
    sourceType: SOURCES.ORDER,
    reason: REASONS.RESERVATION,
    sourceId: data.orderId,
    quantityDelta: -data.quantity,
    updateWhere: { available: { gte: data.quantity } },
    updateData: {
      available: { decrement: data.quantity },
      reserved: { increment: data.quantity },
    },
    insufficientMessage: 'Not enough stock available.',
  });
}

export async function commit(
  userId: string,
  requestedBusinessId: string,
  input: unknown,
): Promise<InventoryMutationResult> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(orderInventoryOpSchema, input);
  const variant = await resolveVariantWithInventory(
    membership.businessId,
    data.variantId,
  );
  return runConditionalOperation({
    businessId: membership.businessId,
    inventoryId: variant.inventory.id,
    sourceType: SOURCES.ORDER,
    reason: REASONS.COMMITMENT,
    sourceId: data.orderId,
    quantityDelta: -data.quantity,
    updateWhere: { reserved: { gte: data.quantity } },
    updateData: { reserved: { decrement: data.quantity } },
    insufficientMessage: 'Cannot commit more stock than is reserved.',
  });
}

export async function release(
  userId: string,
  requestedBusinessId: string,
  input: unknown,
): Promise<InventoryMutationResult> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(orderInventoryOpSchema, input);
  const variant = await resolveVariantWithInventory(
    membership.businessId,
    data.variantId,
  );
  return runConditionalOperation({
    businessId: membership.businessId,
    inventoryId: variant.inventory.id,
    sourceType: SOURCES.ORDER,
    reason: REASONS.RELEASE,
    sourceId: data.orderId,
    quantityDelta: data.quantity,
    updateWhere: { reserved: { gte: data.quantity } },
    updateData: {
      reserved: { decrement: data.quantity },
      available: { increment: data.quantity },
    },
    insufficientMessage: 'Cannot release more stock than is reserved.',
  });
}

export async function restoreAfterRefund(
  userId: string,
  requestedBusinessId: string,
  input: unknown,
): Promise<InventoryMutationResult> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(orderInventoryOpSchema, input);
  const variant = await resolveVariantWithInventory(
    membership.businessId,
    data.variantId,
  );
  return runConditionalOperation({
    businessId: membership.businessId,
    inventoryId: variant.inventory.id,
    sourceType: SOURCES.ORDER,
    reason: REASONS.RETURN_REFUND,
    sourceId: data.orderId,
    quantityDelta: data.quantity,
    updateWhere: {},
    updateData: { available: { increment: data.quantity } },
    insufficientMessage: 'Cannot restore stock.',
  });
}

export async function manualAdjustment(
  userId: string,
  requestedBusinessId: string,
  input: unknown,
): Promise<InventoryMutationResult> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(manualAdjustmentSchema, input);
  const variant = await resolveVariantWithInventory(
    membership.businessId,
    data.variantId,
  );
  const sourceId = data.idempotencyKey ?? randomUUID();
  return runConditionalOperation({
    businessId: membership.businessId,
    inventoryId: variant.inventory.id,
    sourceType: SOURCES.MANUAL_ADJUSTMENT,
    reason: REASONS.MANUAL_ADJUSTMENT,
    sourceId,
    quantityDelta: data.delta,
    updateWhere: data.delta < 0 ? { available: { gte: -data.delta } } : {},
    updateData: { available: { increment: data.delta } },
    insufficientMessage: 'Cannot reduce stock below zero.',
  });
}
