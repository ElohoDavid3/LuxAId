import { prisma } from '../src/lib/prisma';
import { AppError } from '../src/lib/errors';
import { verifyPassword } from '../src/features/auth/password.service';
import {
  generateResetToken,
  hashResetToken,
  requestPasswordReset,
  resetPassword,
} from '../src/features/auth/password-reset.service';
import { createSession, validateSession } from '../src/features/auth/session.service';
import { createUser, resetDatabase, TEST_PASSWORD } from './helpers';

function captureDeliver() {
  const sent: Array<{ email: string; token: string }> = [];
  const deliver = jest.fn(
    async (email: string, token: string) => {
      sent.push({ email, token });
    },
  );
  return { deliver, sent };
}

describe('Password reset', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('stores only the hash of the token and never the raw token', async () => {
    const user = await createUser('reset-hash@example.com');
    const { deliver, sent } = captureDeliver();

    await requestPasswordReset(user.email, deliver);

    expect(sent).toHaveLength(1);
    const raw = sent[0].token;
    expect(raw).toBeTruthy();
    expect(raw).not.toContain(user.id);

    const rows = await prisma.passwordResetToken.findMany({
      where: { userId: user.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashResetToken(raw));
    expect(rows[0].tokenHash).not.toBe(raw);
    expect(rows[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);

    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(raw);
  });

  it('a valid token resets the password and is single-use', async () => {
    const user = await createUser('reset-ok@example.com');
    const { deliver, sent } = captureDeliver();

    await requestPasswordReset(user.email, deliver);
    const raw = sent[0].token;

    const newPassword = 'Brand-new-password-99';
    await resetPassword(raw, newPassword);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword(TEST_PASSWORD, after.passwordHash)).toBe(false);
    expect(await verifyPassword(newPassword, after.passwordHash)).toBe(true);

    const rows = await prisma.passwordResetToken.findMany({
      where: { userId: user.id },
    });
    expect(rows).toHaveLength(0);
  });

  it('an expired token is rejected', async () => {
    const user = await createUser('reset-expired@example.com');
    const { deliver, sent } = captureDeliver();

    await requestPasswordReset(user.email, deliver);
    const raw = sent[0].token;

    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await expect(resetPassword(raw, 'New-password-123')).rejects.toBeInstanceOf(
      AppError,
    );

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword(TEST_PASSWORD, after.passwordHash)).toBe(true);
  });

  it('a consumed token cannot be reused', async () => {
    const user = await createUser('reset-reuse@example.com');
    const { deliver, sent } = captureDeliver();

    await requestPasswordReset(user.email, deliver);
    const raw = sent[0].token;

    await resetPassword(raw, 'First-new-password-1');
    await expect(resetPassword(raw, 'Second-new-password-2')).rejects.toBeInstanceOf(
      AppError,
    );

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword('Second-new-password-2', after.passwordHash)).toBe(
      false,
    );
  });

  it('a new reset request supersedes the previous token', async () => {
    const user = await createUser('reset-supersede@example.com');
    const { deliver, sent } = captureDeliver();

    await requestPasswordReset(user.email, deliver);
    await requestPasswordReset(user.email, deliver);

    expect(sent).toHaveLength(2);
    const first = sent[0].token;
    const second = sent[1].token;
    expect(first).not.toBe(second);

    const rows = await prisma.passwordResetToken.findMany({
      where: { userId: user.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashResetToken(second));

    await expect(resetPassword(first, 'Old-token-password-1')).rejects.toBeInstanceOf(
      AppError,
    );
    await resetPassword(second, 'New-token-password-2');

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword('New-token-password-2', after.passwordHash)).toBe(
      true,
    );
  });

  it('an unknown email returns a uniform response and reveals nothing', async () => {
    const { deliver, sent } = captureDeliver();

    const unknownResult = await requestPasswordReset(
      'ghost@example.com',
      deliver,
    );
    expect(unknownResult).toEqual({ ok: true });
    expect(sent).toHaveLength(0);

    const user = await createUser('reset-uniform@example.com');
    const knownResult = await requestPasswordReset(user.email, deliver);
    expect(knownResult).toEqual(unknownResult);

    const rows = await prisma.passwordResetToken.findMany({
      where: { userId: user.id },
    });
    expect(rows).toHaveLength(1);
  });

  it('a password change revokes the user\u2019s existing sessions', async () => {
    const user = await createUser('reset-sessions@example.com');
    const { sessionToken } = await createSession(user.id);

    const { deliver, sent } = captureDeliver();
    await requestPasswordReset(user.email, deliver);
    await resetPassword(sent[0].token, 'Post-reset-password-1');

    expect(await validateSession(sessionToken)).toBeNull();
  });

  it('a short password is rejected and the token is preserved', async () => {
    const user = await createUser('reset-short@example.com');
    const { deliver, sent } = captureDeliver();

    await requestPasswordReset(user.email, deliver);
    const raw = sent[0].token;

    await expect(resetPassword(raw, 'short')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    const rows = await prisma.passwordResetToken.findMany({
      where: { userId: user.id },
    });
    expect(rows).toHaveLength(1);
  });

  it('generates cryptographically strong tokens', () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
  });
});
