import { z, ZodError } from 'zod';
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

export const createOrderSchema = z
  .object({
    customerId: z.string().min(1, 'customerId is required'),
    items: z
      .array(
        z
          .object({
            variantId: z.string().min(1, 'variantId is required'),
            quantity: z.number().int().positive('quantity must be positive'),
          })
          .strict(),
      )
      .min(1, 'At least one item is required'),
    deliveryZoneId: z.string().min(1).optional(),
  })
  .strict();
