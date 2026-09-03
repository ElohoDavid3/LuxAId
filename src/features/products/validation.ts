import { z } from 'zod';
import { ProductStatus } from '@prisma/client';

export { parseOrThrow } from '../../lib/validation';

const nameSchema = z.string().trim().min(1, 'name is required');
const descriptionSchema = z.string().trim().min(1, 'description is required');
const imageUrlSchema = z
  .string()
  .trim()
  .refine(
    (v) => z.string().url().safeParse(v).success || v.startsWith('/'),
    'image URL must be a valid URL',
  );
const categorySchema = z.string().trim().min(1).max(50);
const priceInKoboSchema = z
  .number()
  .int('price must be a whole number of kobo')
  .nonnegative('price cannot be negative');
const skuSchema = z.string().trim().min(1, 'sku is required');
const attributesSchema = z.record(z.string(), z.unknown());
const productStatusSchema = z.nativeEnum(ProductStatus);
const positiveQuantitySchema = z
  .number()
  .int('quantity must be a whole number')
  .positive('quantity must be greater than zero');

export const createProductSchema = z
  .object({
    name: nameSchema,
    description: descriptionSchema,
    imageUrl: imageUrlSchema.optional(),
    category: categorySchema.optional(),
    price: priceInKoboSchema,
    status: productStatusSchema.optional(),
    variant: z
      .object({
        sku: skuSchema.optional(),
        name: nameSchema.optional(),
        attributes: attributesSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const updateProductSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    imageUrl: imageUrlSchema.nullable().optional(),
    category: categorySchema.nullable().optional(),
    price: priceInKoboSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const changeProductStatusSchema = productStatusSchema;

export const listProductsSchema = z
  .object({
    status: productStatusSchema.optional(),
  })
  .strict();

export const createVariantSchema = z
  .object({
    productId: z.string().min(1, 'productId is required'),
    sku: skuSchema,
    name: nameSchema,
    attributes: attributesSchema.optional(),
  })
  .strict();

export const updateVariantSchema = z
  .object({
    sku: skuSchema.optional(),
    name: nameSchema.optional(),
    attributes: attributesSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const setStockSchema = z
  .object({
    variantId: z.string().min(1, 'variantId is required'),
    available: z
      .number()
      .int('available must be a whole number')
      .nonnegative('available cannot be negative'),
    location: z.string().trim().min(1).optional(),
  })
  .strict();

export const checkAvailabilitySchema = z
  .object({
    variantId: z.string().min(1, 'variantId is required'),
    quantity: positiveQuantitySchema,
  })
  .strict();

export const orderInventoryOpSchema = z
  .object({
    variantId: z.string().min(1, 'variantId is required'),
    quantity: positiveQuantitySchema,
    orderId: z.string().min(1, 'orderId is required'),
  })
  .strict();

export const manualAdjustmentSchema = z
  .object({
    variantId: z.string().min(1, 'variantId is required'),
    delta: z
      .number()
      .int('delta must be a whole number')
      .refine((v) => v !== 0, { message: 'delta must not be zero' }),
    idempotencyKey: z.string().min(1).optional(),
  })
  .strict();
