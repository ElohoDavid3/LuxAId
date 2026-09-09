import { z } from 'zod';

export { parseOrThrow } from '../../lib/validation';
import { parseOrThrow } from '../../lib/validation';

const phoneNumberIdSchema = z
  .string()
  .trim()
  .min(1, 'phone number id is required')
  .max(64);

const accessTokenSchema = z.string().trim().min(1).max(1024);

const businessAccountIdSchema = z.string().trim().min(1).max(64);

export const connectWhatsAppSchema = z
  .object({
    phoneNumberId: phoneNumberIdSchema,
    accessToken: accessTokenSchema.optional(),
    businessAccountId: businessAccountIdSchema.optional(),
  })
  .strict();

export const connectInstagramSchema = z
  .object({
    instagramAccountId: phoneNumberIdSchema,
    accessToken: accessTokenSchema.optional(),
  })
  .strict();

export const connectFacebookSchema = z
  .object({
    pageId: phoneNumberIdSchema,
    accessToken: accessTokenSchema.optional(),
  })
  .strict();

export function parseConnectWhatsAppInput(input: unknown) {
  return parseOrThrow(connectWhatsAppSchema, input);
}

export function parseConnectInstagramInput(input: unknown) {
  return parseOrThrow(connectInstagramSchema, input);
}

export function parseConnectFacebookInput(input: unknown) {
  return parseOrThrow(connectFacebookSchema, input);
}
