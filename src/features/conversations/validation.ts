import { ConversationControlState, ConversationStatus } from '@prisma/client';
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

export const createConversationSchema = z
  .object({
    customerId: z.string().trim().min(1, 'customerId is required'),
    channel: z.string().trim().min(1).optional(),
    status: z.nativeEnum(ConversationStatus).optional(),
    controlState: z.nativeEnum(ConversationControlState).optional(),
  })
  .strict();

export const listConversationsSchema = z
  .object({
    status: z.nativeEnum(ConversationStatus).optional(),
  })
  .strict();
