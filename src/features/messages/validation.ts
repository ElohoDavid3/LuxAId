import {
  MessageAuthorType,
  MessageDirection,
  MessageDeliveryStatus,
} from '@prisma/client';
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

export const createMessageSchema = z
  .object({
    body: z.string().trim().min(1, 'body is required'),
    authorType: z.nativeEnum(MessageAuthorType),
    direction: z.nativeEnum(MessageDirection).optional().default('OUTBOUND'),
    status: z
      .nativeEnum(MessageDeliveryStatus)
      .optional()
      .default('SENT'),
    channel: z.string().trim().min(1, 'channel is required'),
    providerMessageId: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export const listMessagesSchema = z
  .object({
    cursor: z.string().trim().min(1).optional(),
    limit: z.number().int().min(1).max(50).default(50).optional(),
  })
  .strict();
