import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { MembershipStatus } from '@prisma/client';
import { roleHasScope, type Scope } from './permissions';
import { safeAudit } from './audit';

export interface AuthorizedMembership {
  id: string;
  businessId: string;
  userId: string;
  role: import('@prisma/client').MembershipRole;
}

/**
 * Resolve the caller's ACTIVE membership for a requested business.
 * The requested businessId is never trusted on its own: it is used only to
 * locate a membership row that links the authenticated user to that business.
 * A missing, inactive, or cross-tenant membership is indistinguishable here
 * (all fail the same way), so a user of Business A cannot reach Business B.
 */
export async function requireActiveMembership(
  userId: string,
  requestedBusinessId: string,
): Promise<AuthorizedMembership> {
  const membership = await prisma.businessMembership.findUnique({
    where: { businessId_userId: { businessId: requestedBusinessId, userId } },
  });

  if (!membership || membership.status !== MembershipStatus.ACTIVE) {
    await safeAudit({
      businessId: requestedBusinessId,
      eventType: 'AUTHZ_DENIED',
      actorType: 'USER',
      actorId: userId,
      payload: { reason: 'no_active_membership' },
    });
    throw new AppError('FORBIDDEN', 'You do not have access to this business.');
  }

  return {
    id: membership.id,
    businessId: membership.businessId,
    userId: membership.userId,
    role: membership.role,
  };
}

/**
 * Resolve the caller's active membership AND verify the role grants the
 * requested least-privilege scope. The returned membership.businessId is the
 * authoritative tenant boundary for the operation that follows.
 */
export async function requireScope(
  userId: string,
  requestedBusinessId: string,
  scope: Scope,
): Promise<AuthorizedMembership> {
  const membership = await requireActiveMembership(userId, requestedBusinessId);

  if (!roleHasScope(membership.role, scope)) {
    await safeAudit({
      businessId: membership.businessId,
      eventType: 'AUTHZ_DENIED',
      actorType: 'USER',
      actorId: userId,
      payload: { reason: 'scope_denied', scope },
    });
    throw new AppError(
      'FORBIDDEN',
      'You do not have permission to perform this action.',
    );
  }

  return membership;
}
