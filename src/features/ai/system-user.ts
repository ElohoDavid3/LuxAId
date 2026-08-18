import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { MembershipRole, MembershipStatus } from '@prisma/client';

const SYSTEM_USER_EMAIL_SUFFIX = '@orderaid.internal';

export async function resolveSystemUser(
  businessId: string,
): Promise<{ userId: string; membershipId: string }> {
  const membership = await prisma.businessMembership.findFirst({
    where: {
      businessId,
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
      user: {
        email: { endsWith: SYSTEM_USER_EMAIL_SUFFIX },
      },
    },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!membership) {
    throw new AppError(
      'INTERNAL_ERROR',
      'AI system user is not configured for this business.',
    );
  }

  return { userId: membership.userId, membershipId: membership.id };
}
