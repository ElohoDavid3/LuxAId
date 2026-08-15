import { createHash, randomBytes } from 'crypto';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { hashPassword } from './password.service';
import { normalizeEmail } from './credentials';

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

export type DeliverResetEmail = (
  email: string,
  rawToken: string,
) => Promise<void>;

export function generateResetToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Request a password reset. Returns an identical success response whether or
 * not the email is registered, and never reveals account existence.
 * A new request supersedes all previous pending tokens for the user.
 */
export async function requestPasswordReset(
  email: string,
  deliver: DeliverResetEmail,
): Promise<{ ok: true }> {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
  });

  if (user) {
    const rawToken = generateResetToken();
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashResetToken(rawToken),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      }),
    ]);
    await deliver(user.email, rawToken);
  }

  return { ok: true };
}

/**
 * Consume a reset token and change the user's password.
 * - single-use: the token row is deleted when consumed
 * - expired tokens are rejected (and deleted)
 * - the password change revokes the user's existing sessions
 * - all pending reset tokens for the user are invalidated
 */
export async function resetPassword(
  rawToken: string,
  newPassword: string,
): Promise<void> {
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Your new password must be at least 8 characters long.',
    );
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(rawToken) },
    include: { user: true },
  });

  if (!record) {
    throw new AppError(
      'VALIDATION_ERROR',
      'This reset link is invalid or has expired.',
    );
  }

  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.passwordResetToken.delete({ where: { id: record.id } });
    throw new AppError(
      'VALIDATION_ERROR',
      'This reset link is invalid or has expired.',
    );
  }

  const newPasswordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId } }),
    prisma.session.deleteMany({ where: { userId: record.userId } }),
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: newPasswordHash },
    }),
  ]);
}
