import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { hashPassword, verifyPassword } from './password.service';
import { normalizeEmail } from './credentials';
import { logAudit } from './audit';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  email: z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .email('Enter a valid email address')
        .max(254, 'Email must be at most 254 characters'),
    )
    .optional(),
  currentPassword: z.string().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Enter your current password')
    .max(MAX_PASSWORD_LENGTH),
  newPassword: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      'Your new password must be at least 8 characters long.',
    )
    .max(MAX_PASSWORD_LENGTH),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export interface UpdateProfileResult {
  id: string;
  name: string;
  email: string;
}

function validationError(message: string): AppError {
  return new AppError('VALIDATION_ERROR', message);
}

async function requireActiveBusinessId(userId: string): Promise<string> {
  const membership = await prisma.businessMembership.findFirst({
    where: { userId, status: 'ACTIVE' },
    select: { businessId: true },
  });
  if (!membership) {
    throw new AppError('FORBIDDEN', 'You do not have an active business.');
  }
  return membership.businessId;
}

function firstValidationMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Please check your details and try again.';
}

export async function updateUserProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<UpdateProfileResult> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    throw validationError(firstValidationMessage(parsed.error));
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError('UNAUTHORIZED', 'Please sign in again.');
  }

  const data: { name: string; email?: string } = {
    name: parsed.data.name.trim(),
  };
  const changedFields = ['name'];

  if (parsed.data.email !== undefined) {
    const normalizedEmail = normalizeEmail(parsed.data.email);
    if (normalizedEmail !== user.email) {
      if (!parsed.data.currentPassword) {
        throw validationError(
          'Enter your current password to change your email.',
        );
      }
      const currentValid = await verifyPassword(
        parsed.data.currentPassword,
        user.passwordHash,
      );
      if (!currentValid) {
        throw validationError('Your current password is incorrect.');
      }
      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      if (existing) {
        throw validationError('An account with this email already exists.');
      }
      data.email = normalizedEmail;
      changedFields.push('email');
    }
  }

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true },
    });

    const businessId = await requireActiveBusinessId(userId);
    await logAudit({
      businessId,
      eventType: 'auth.profile_updated',
      actorId: userId,
      actorType: 'USER',
      payload: { fields: changedFields },
    });
    logger.info('auth.profile_updated', { userId, fields: changedFields });

    return updated;
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      throw validationError('An account with this email already exists.');
    }
    throw e;
  }
}

export async function changeUserPassword(
  userId: string,
  input: ChangePasswordInput,
): Promise<void> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    throw validationError(firstValidationMessage(parsed.error));
  }

  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError('UNAUTHORIZED', 'Please sign in again.');
  }

  const currentValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentValid) {
    throw validationError('Your current password is incorrect.');
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
  ]);

  const businessId = await requireActiveBusinessId(userId);
  await logAudit({
    businessId,
    eventType: 'auth.password_changed',
    actorId: userId,
    actorType: 'USER',
  });
  logger.info('auth.password_changed', { userId });
}
