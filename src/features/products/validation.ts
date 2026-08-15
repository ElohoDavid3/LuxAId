import { z, ZodError } from 'zod';
import { ProductStatus } from '@prisma/client';
import { AppError } from '../../lib/errors';

export function parseOrThrow<O>(schema: z.ZodSchema<O>, input: unknown): O {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      const path = issue ? issue.path.join('.') : '';
      throw new AppError(
        'VALIDATION_ERROR',
        issue ? `${path}: ${issue.message}` : 'Invalid input.',
      );
    }
    throw error;
  }
}

const nameSchema = z.string().trim().min(1, 'name is required');
const descriptionSchema = z.string().trim().min(1, 'description is required');
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
    price: priceInKoboSchema,
    status: productStatusSchema.optional(),
    variant: z
      .object({
        sku: skuSchema,
        name: nameSchema.optional(),
        attributes: attributesSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const updateProductSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
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
