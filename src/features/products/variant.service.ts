import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { AppError } from '../../lib/errors';
import { Prisma } from '@prisma/client';
import {
  createVariantSchema,
  parseOrThrow,
  updateVariantSchema,
} from './validation';
import { duplicateSkuError, isUniqueConstraintViolation } from './errors';

const VARIANTS_SCOPE = 'products_inventory' as const;

async function resolveMembership(userId: string, requestedBusinessId: string) {
  return requireScope(userId, requestedBusinessId, VARIANTS_SCOPE);
}

const variantInclude = {
  inventory: true,
} satisfies Prisma.ProductVariantInclude;

export type VariantWithInventory = Prisma.ProductVariantGetPayload<{
  include: typeof variantInclude;
}>;

export async function createVariant(
  userId: string,
  requestedBusinessId: string,
  input: unknown,
): Promise<VariantWithInventory> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(createVariantSchema, input);
  try {
    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: data.productId, businessId: membership.businessId },
        select: { id: true },
      });
      if (!product) {
        throw new AppError('UNKNOWN_PRODUCT', 'Product not found.');
      }
      return tx.productVariant.create({
        data: {
          businessId: membership.businessId,
          productId: product.id,
          name: data.name,
          sku: data.sku,
          attributes: (data.attributes ?? {}) as Prisma.InputJsonValue,
          inventory: {
            create: {
              businessId: membership.businessId,
              available: 0,
              reserved: 0,
            },
          },
        },
        include: variantInclude,
      });
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) throw duplicateSkuError();
    throw error;
  }
}

export async function getVariant(
  userId: string,
  requestedBusinessId: string,
  variantId: string,
): Promise<VariantWithInventory> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, businessId: membership.businessId },
    include: variantInclude,
  });
  if (!variant) {
    throw new AppError('UNKNOWN_PRODUCT', 'Variant not found.');
  }
  return variant;
}

export async function updateVariant(
  userId: string,
  requestedBusinessId: string,
  variantId: string,
  input: unknown,
): Promise<VariantWithInventory> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(updateVariantSchema, input);
  const existing = await prisma.productVariant.findFirst({
    where: { id: variantId, businessId: membership.businessId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError('UNKNOWN_PRODUCT', 'Variant not found.');
  }
  try {
    return await prisma.productVariant.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.sku !== undefined ? { sku: data.sku } : {}),
        ...(data.attributes !== undefined
          ? { attributes: data.attributes as Prisma.InputJsonValue }
          : {}),
      },
      include: variantInclude,
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) throw duplicateSkuError();
    throw error;
  }
}

export async function listVariants(
  userId: string,
  requestedBusinessId: string,
  productId: string,
): Promise<VariantWithInventory[]> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const product = await prisma.product.findFirst({
    where: { id: productId, businessId: membership.businessId },
    select: { id: true },
  });
  if (!product) {
    throw new AppError('UNKNOWN_PRODUCT', 'Product not found.');
  }
  return prisma.productVariant.findMany({
    where: { productId: product.id, businessId: membership.businessId },
    include: variantInclude,
    orderBy: { createdAt: 'asc' },
  });
}
