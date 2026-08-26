import { z } from 'zod';

export { parseOrThrow } from '../../lib/validation';

const zoneNameSchema = z
  .string()
  .trim()
  .min(1, 'Zone name is required')
  .max(100, 'Zone name must be at most 100 characters');

const feeInKoboSchema = z
  .number()
  .int('Fee must be a whole number of kobo')
  .nonnegative('Fee cannot be negative');

const coverageLabelSchema = z
  .string()
  .trim()
  .min(1, 'Coverage areas cannot be empty')
  .max(100, 'Each coverage area must be at most 100 characters');

const coverageSchema = z
  .array(coverageLabelSchema)
  .min(1, 'Add at least one coverage area')
  .max(50, 'A zone can have at most 50 coverage areas');

export const createDeliveryZoneSchema = z
  .object({
    name: zoneNameSchema,
    fee: feeInKoboSchema,
    coverage: coverageSchema,
  })
  .strict();

export const updateDeliveryZoneSchema = z
  .object({
    name: zoneNameSchema.optional(),
    fee: feeInKoboSchema.optional(),
    coverage: coverageSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update.',
  });
