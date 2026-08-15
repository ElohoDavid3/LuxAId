import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { AppError } from '../../lib/errors';
import { ProductStatus, Prisma } from '@prisma/client';
import {
  createProductSchema,
  listProductsSchema,
  parseOrThrow,
  updateProductSchema,
  changeProductStatusSchema,
} from './validation';
import { assertProductStatusTransition } from './product-status';
import { duplicateSkuError, isUniqueConstraintViolation } from './errors';

const PRODUCTS_SCOPE = 'products_inventory' as const;

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
  try {
    return await prisma.$transaction(async (tx) => {
      return tx.product.create({
        data: {
          businessId: membership.businessId,
          name: data.name,
          description: data.description,
          price: data.price,
          status: data.status ?? ProductStatus.DRAFT,
          variants: {
            create: {
              businessId: membership.businessId,
              name: data.variant.name ?? data.name,
              sku: data.variant.sku,
              attributes: (data.variant.attributes ??
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
    if (isUniqueConstraintViolation(error)) throw duplicateSkuError();
    throw error;
  }
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
