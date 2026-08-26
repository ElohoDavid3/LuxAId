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

export const createEscalationSchema = z
  .object({
    reason: z.string().trim().min(1, 'reason is required'),
  })
  .strict();

export const assignEscalationSchema = z
  .object({
    assigneeId: z.string().trim().min(1, 'assigneeId is required'),
  })
  .strict();

export const cancelEscalationSchema = z
  .object({
    reason: z.string().trim().min(1, 'reason is required').optional(),
  })
  .strict();

export const reassignEscalationSchema = z.object({}).strict();
