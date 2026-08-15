import { prisma } from '../src/lib/prisma';
import { AppError } from '../src/lib/errors';
import {
  requireActiveMembership,
  requireScope,
} from '../src/features/auth/authorization';
import {
  createUser,
  createBusiness,
  createMembership,
  resetDatabase,
} from './helpers';
import { MembershipRole, MembershipStatus } from '@prisma/client';

describe('Multi-tenancy isolation', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lets User A access Business A through an ACTIVE membership', async () => {
    const user = await createUser('tenant-a@example.com');
    const business = await createBusiness('Tenant A Shop');
    await createMembership(user.id, business.id, MembershipRole.OWNER);

    const membership = await requireActiveMembership(user.id, business.id);
    expect(membership.businessId).toBe(business.id);
    expect(membership.role).toBe(MembershipRole.OWNER);
  });

  it('blocks User A from accessing Business B', async () => {
    const userA = await createUser('tenant-b-a@example.com');
    const businessA = await createBusiness('Tenant B A');
    await createMembership(userA.id, businessA.id, MembershipRole.OWNER);
    const businessB = await createBusiness('Tenant B B');

    await expect(
      requireActiveMembership(userA.id, businessB.id),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('blocks an INACTIVE membership from accessing the business', async () => {
    const user = await createUser('tenant-inactive@example.com');
    const business = await createBusiness('Tenant Inactive');
    await createMembership(
      user.id,
      business.id,
      MembershipRole.OWNER,
      MembershipStatus.INACTIVE,
    );

    await expect(
      requireActiveMembership(user.id, business.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      requireScope(user.id, business.id, 'orders'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('treats a non-existent business identically to an unauthorized one', async () => {
    const user = await createUser('tenant-ghost@example.com');
    const ownBusiness = await createBusiness('Tenant Ghost Own');
    await createMembership(user.id, ownBusiness.id, MembershipRole.OWNER);
    const foreignBusiness = await createBusiness('Tenant Ghost Foreign');

    const missing = requireActiveMembership(user.id, 'does-not-exist');
    const unauthorized = requireActiveMembership(user.id, foreignBusiness.id);

    await expect(missing).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(unauthorized).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('never lets a client-supplied businessId bypass isolation', async () => {
    const userA = await createUser('tenant-bypass@example.com');
    const businessA = await createBusiness('Tenant Bypass A');
    await createMembership(userA.id, businessA.id, MembershipRole.OWNER);
    const businessB = await createBusiness('Tenant Bypass B');

    const attacker = await createUser('tenant-bypass-b@example.com');
    await createMembership(attacker.id, businessB.id, MembershipRole.OWNER);

    await expect(
      requireScope(attacker.id, businessA.id, 'analytics'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      requireActiveMembership(userA.id, businessB.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('denies an unauthorized role a restricted action', async () => {
    const user = await createUser('tenant-role-deny@example.com');
    const business = await createBusiness('Tenant Role Deny');
    await createMembership(
      user.id,
      business.id,
      MembershipRole.SUPPORT_AGENT,
    );

    await expect(
      requireScope(user.id, business.id, 'orders'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      requireScope(user.id, business.id, 'payments'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows an authorized role to perform a permitted action', async () => {
    const owner = await createUser('tenant-ok-owner@example.com');
    const ownerBusiness = await createBusiness('Tenant OK Owner');
    await createMembership(owner.id, ownerBusiness.id, MembershipRole.OWNER);

    const support = await createUser('tenant-ok-support@example.com');
    const supportBusiness = await createBusiness('Tenant OK Support');
    await createMembership(
      support.id,
      supportBusiness.id,
      MembershipRole.SUPPORT_AGENT,
    );

    const ownerMembership = await requireScope(
      owner.id,
      ownerBusiness.id,
      'analytics',
    );
    expect(ownerMembership.businessId).toBe(ownerBusiness.id);

    const supportMembership = await requireScope(
      support.id,
      supportBusiness.id,
      'conversations',
    );
    expect(supportMembership.businessId).toBe(supportBusiness.id);
  });

  it('audits denied access attempts against the target business', async () => {
    const user = await createUser('tenant-audit@example.com');
    const business = await createBusiness('Tenant Audit A');
    await createMembership(user.id, business.id, MembershipRole.OWNER);
    const otherBusiness = await createBusiness('Tenant Audit B');

    await expect(
      requireActiveMembership(user.id, otherBusiness.id),
    ).rejects.toBeInstanceOf(AppError);

    const denied = await prisma.auditLog.findMany({
      where: { businessId: otherBusiness.id, eventType: 'AUTHZ_DENIED' },
    });
    expect(denied.length).toBeGreaterThanOrEqual(1);
    expect(denied[0].actorId).toBe(user.id);
  });
});
