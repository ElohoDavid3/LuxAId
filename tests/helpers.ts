import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/features/auth/password.service';
import { MembershipRole, MembershipStatus } from '@prisma/client';

export const TEST_PASSWORD = 'Correct-horse-battery-1';

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Business", "User" CASCADE');
}

export async function createUser(
  email: string,
  password: string = TEST_PASSWORD,
) {
  return prisma.user.create({
    data: {
      name: email.split('@')[0],
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
    },
  });
}

export function createBusiness(name: string) {
  return prisma.business.create({ data: { name } });
}

export function createMembership(
  userId: string,
  businessId: string,
  role: MembershipRole = MembershipRole.OWNER,
  status: MembershipStatus = MembershipStatus.ACTIVE,
) {
  return prisma.businessMembership.create({
    data: { userId, businessId, role, status },
  });
}

export type UserWithMembership = {
  user: Awaited<ReturnType<typeof prisma.user.create>>;
  business: Awaited<ReturnType<typeof prisma.business.create>>;
  membership: Awaited<ReturnType<typeof prisma.businessMembership.create>>;
};

export async function createUserInBusiness(
  email: string,
  role: MembershipRole = MembershipRole.OWNER,
  status: MembershipStatus = MembershipStatus.ACTIVE,
): Promise<UserWithMembership> {
  const user = await createUser(email);
  const business = await createBusiness(`${email.split('@')[0]}'s Shop`);
  const membership = await createMembership(user.id, business.id, role, status);
  return { user, business, membership };
}
