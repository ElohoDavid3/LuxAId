import { prisma } from '../../lib/prisma';
import { verifyPassword } from './password.service';

export interface VerifiedCredentials {
  id: string;
  name: string;
  email: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function authorizeCredentials(
  email: string | undefined,
  password: string | undefined,
): Promise<VerifiedCredentials | null> {
  if (!email || !password) return null;
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
  });
  if (!user) return null;
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;
  return { id: user.id, name: user.name, email: user.email };
}
