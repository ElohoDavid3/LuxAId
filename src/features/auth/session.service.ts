import { randomBytes } from 'crypto';
import { prisma } from '../../lib/prisma';

export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function createSession(
  userId: string,
  expiresInMs: number = SESSION_MAX_AGE_MS,
) {
  const sessionToken = generateSessionToken();
  const expires = new Date(Date.now() + expiresInMs);
  await prisma.session.create({ data: { sessionToken, userId, expires } });
  return { sessionToken, expires };
}

export async function validateSession(sessionToken: string | null | undefined) {
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expires.getTime() < Date.now()) {
    await prisma.session
      .delete({ where: { id: session.id } })
      .catch(() => undefined);
    return null;
  }
  return session;
}

export async function invalidateSession(
  sessionToken: string | null | undefined,
): Promise<void> {
  if (!sessionToken) return;
  await prisma.session
    .delete({ where: { sessionToken } })
    .catch((error: unknown) => {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2025'
      ) {
        return;
      }
      throw error;
    });
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
