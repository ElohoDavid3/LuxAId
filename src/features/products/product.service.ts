import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { AppError } from '../../lib/errors';
import { ProductStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  createProductSchema,
  listProductsSchema,
  parseOrThrow,
  updateProductSchema,
  changeProductStatusSchema,
} from './validation';
import { assertProductStatusTransition } from './product-status';
import { duplicateSkuError, isUniqueConstraintViolation } from './errors';
import { generateSku } from './sku';

const PRODUCTS_SCOPE = 'products_inventory' as const;
const MAX_AUTO_SKU_ATTEMPTS = 5;

async function resolveMembership(userId: string, requestedBusinessId: string) {
  return requireScope(userId, requestedBusinessId, PRODUCTS_SCOPE);
}

const productInclude = {
  variants: {
    include: { inventory: true },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.ProductInclude;

export type ProductWithVariants = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

export async function createProduct(
  userId: string,
  requestedBusinessId: string,
  input: unknown,
): Promise<ProductWithVariants> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(createProductSchema, input);
  const variantInput = data.variant ?? {};
  const userSku = variantInput.sku;
  const maxAttempts = userSku ? 1 : MAX_AUTO_SKU_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const sku = userSku ?? generateSku(data.name);
    try {
      return await prisma.$transaction(async (tx) => {
        return tx.product.create({
          data: {
            businessId: membership.businessId,
            name: data.name,
            description: data.description,
            imageUrl: data.imageUrl ?? null,
            category: data.category ?? null,
            price: data.price,
            status: data.status ?? ProductStatus.DRAFT,
            variants: {
              create: {
                businessId: membership.businessId,
                name: variantInput.name ?? data.name,
                sku,
                attributes: (variantInput.attributes ??
                  {}) as Prisma.InputJsonValue,
                inventory: {
                  create: {
                    businessId: membership.businessId,
                    available: 0,
                    reserved: 0,
                  },
                },
              },
            },
          },
          include: productInclude,
        });
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      if (userSku) throw duplicateSkuError();
    }
  }
  throw new AppError(
    'INTERNAL_ERROR',
    'Could not generate a unique SKU. Please try again.',
  );
}

export async function getProduct(
  userId: string,
  requestedBusinessId: string,
  productId: string,
): Promise<ProductWithVariants> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const product = await prisma.product.findFirst({
    where: { id: productId, businessId: membership.businessId },
    include: productInclude,
  });
  if (!product) {
    throw new AppError('UNKNOWN_PRODUCT', 'Product not found.');
  }
  return product;
}

export async function listProducts(
  userId: string,
  requestedBusinessId: string,
  input: unknown = {},
): Promise<{ items: ProductWithVariants[]; total: number }> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const { status } = parseOrThrow(listProductsSchema, input);
  const where = {
    businessId: membership.businessId,
    ...(status ? { status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.product.count({ where }),
  ]);
  return { items, total };
}

export async function updateProduct(
  userId: string,
  requestedBusinessId: string,
  productId: string,
  input: unknown,
): Promise<ProductWithVariants> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(updateProductSchema, input);
  const existing = await prisma.product.findFirst({
    where: { id: productId, businessId: membership.businessId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError('UNKNOWN_PRODUCT', 'Product not found.');
  }
  return prisma.product.update({
    where: { id: existing.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined
        ? { description: data.description }
        : {}),
      ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.price !== undefined ? { price: data.price } : {}),
    },
    include: productInclude,
  });
}

export async function changeProductStatus(
  userId: string,
  requestedBusinessId: string,
  productId: string,
  status: unknown,
): Promise<ProductWithVariants> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const target = parseOrThrow(changeProductStatusSchema, status);
  const existing = await prisma.product.findFirst({
    where: { id: productId, businessId: membership.businessId },
    select: { id: true, status: true },
  });
  if (!existing) {
    throw new AppError('UNKNOWN_PRODUCT', 'Product not found.');
  }
  assertProductStatusTransition(existing.status, target);
  return prisma.product.update({
    where: { id: existing.id },
    data: { status: target },
    include: productInclude,
  });
}

const searchProductsSchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    minPrice: z.number().int().nonnegative().optional(),
    maxPrice: z.number().int().nonnegative().optional(),
  })
  .strict();

export async function searchProducts(
  userId: string,
  requestedBusinessId: string,
  query: string,
  filters?: { minPrice?: number; maxPrice?: number },
): Promise<ProductWithVariants[]> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(searchProductsSchema, {
    query,
    ...filters,
  });

  const where: Prisma.ProductWhereInput = {
    businessId: membership.businessId,
    status: ProductStatus.ACTIVE,
    OR: [
      { name: { contains: data.query, mode: 'insensitive' } },
      { description: { contains: data.query, mode: 'insensitive' } },
    ],
  };

  if (data.minPrice !== undefined || data.maxPrice !== undefined) {
    where.price = {};
    if (data.minPrice !== undefined) where.price.gte = data.minPrice;
    if (data.maxPrice !== undefined) where.price.lte = data.maxPrice;
  }

  return prisma.product.findMany({
    where,
    include: productInclude,
    take: 10,
    orderBy: { createdAt: 'desc' },
  });
}
