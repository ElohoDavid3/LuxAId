import { z, ZodError, ZodTypeAny } from 'zod';
import { AppError } from '../../lib/errors';

export function parseOrThrow<T extends ZodTypeAny>(schema: T, input: unknown): z.output<T> {
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

export const FlutterwaveWebhookDataSchema = z.object({
  id: z.union([z.number(), z.string()]),
  tx_ref: z.string().min(1, 'tx_ref is required'),
  flw_ref: z.string().optional(),
  amount: z.number(),
  currency: z.string().default('NGN'),
  status: z.string(),
  customer: z
    .object({
      id: z.number().optional(),
      name: z.string().optional(),
      phone_number: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
}).passthrough();

export const FlutterwaveWebhookPayloadSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  event: z.string().optional(),
  type: z.string().optional(),
  'event.type': z.string().optional(),
  data: FlutterwaveWebhookDataSchema,
}).passthrough();

export type FlutterwaveWebhookPayload = z.infer<typeof FlutterwaveWebhookPayloadSchema>;

export function parseFlutterwaveWebhookPayload(
  rawPayload: unknown,
): FlutterwaveWebhookPayload {
  return parseOrThrow(FlutterwaveWebhookPayloadSchema, rawPayload);
}

export const InitiatePaymentInputSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
  redirectUrl: z.string().url('redirectUrl must be a valid URL').optional(),
});

export type InitiatePaymentInput = z.infer<typeof InitiatePaymentInputSchema>;
