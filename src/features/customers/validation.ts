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

const nameSchema = z.string().trim().min(1, 'name is required');

export const createCustomerSchema = z
  .object({
    name: nameSchema,
    email: z.string().email('invalid email format').nullable().optional(),
    phone: z.string().trim().nullable().optional(),
    location: z.string().trim().nullable().optional(),
  })
  .strict();

export const updateCustomerSchema = z
  .object({
    name: nameSchema.optional(),
    email: z.string().email('invalid email format').nullable().optional(),
    phone: z.string().trim().nullable().optional(),
    location: z.string().trim().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const listCustomersSchema = z.object({}).strict();
