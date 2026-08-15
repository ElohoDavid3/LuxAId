import { prisma } from '../src/lib/prisma';
import {
  roleHasScope,
  scopesForRole,
  SCOPE_AREAS,
} from '../src/features/auth/permissions';
import { createUser, createBusiness, resetDatabase } from './helpers';
import { MembershipRole } from '@prisma/client';

describe('Membership roles', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('gives OWNER every least-privilege scope', () => {
    for (const scope of SCOPE_AREAS) {
      expect(roleHasScope(MembershipRole.OWNER, scope)).toBe(true);
    }
    expect(scopesForRole(MembershipRole.OWNER)).toEqual([...SCOPE_AREAS]);
  });

  it('gives STAFF operational order and payment access only', () => {
    expect(roleHasScope(MembershipRole.STAFF, 'orders')).toBe(true);
    expect(roleHasScope(MembershipRole.STAFF, 'payments')).toBe(true);

    for (const scope of [
      'business_admin',
      'products_inventory',
      'conversations',
      'staff_management',
      'analytics',
    ] as const) {
      expect(roleHasScope(MembershipRole.STAFF, scope)).toBe(false);
    }
  });

  it('gives SUPPORT_AGENT conversation and customer-support access only', () => {
    expect(roleHasScope(MembershipRole.SUPPORT_AGENT, 'conversations')).toBe(
      true,
    );

    for (const scope of [
      'business_admin',
      'products_inventory',
      'orders',
      'payments',
      'staff_management',
      'analytics',
    ] as const) {
      expect(roleHasScope(MembershipRole.SUPPORT_AGENT, scope)).toBe(false);
    }
  });

  it('rejects an invalid role at the database level', async () => {
    const user = await createUser('invalid-role@example.com');
    const business = await createBusiness('Invalid Role Shop');

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "BusinessMembership" ("id", "businessId", "userId", "role", "status")
         VALUES ('bm-invalid-role', $1, $2, 'SUPERADMIN', 'ACTIVE')`,
        business.id,
        user.id,
      ),
    ).rejects.toThrow();
  });

  it('rejects an invalid membership status at the database level', async () => {
    const user = await createUser('invalid-status@example.com');
    const business = await createBusiness('Invalid Status Shop');

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "BusinessMembership" ("id", "businessId", "userId", "role", "status")
         VALUES ('bm-invalid-status', $1, $2, 'OWNER', 'SOMETIMES')`,
        business.id,
        user.id,
      ),
    ).rejects.toThrow();
  });
});
