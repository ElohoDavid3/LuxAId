import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { Prisma } from '@prisma/client';

const CONVERSATIONS_SCOPE = 'conversations' as const;

async function resolveMembership(userId: string, requestedBusinessId: string) {
  return requireScope(userId, requestedBusinessId, CONVERSATIONS_SCOPE);
}

export type KnowledgeRecord = Prisma.KnowledgeSourceGetPayload<
  Record<string, never>
>;

export async function getActiveKnowledge(
  userId: string,
  requestedBusinessId: string,
): Promise<KnowledgeRecord[]> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  return prisma.knowledgeSource.findMany({
    where: {
      businessId: membership.businessId,
      status: 'ACTIVE',
      stale: false,
    },
    orderBy: { createdAt: 'desc' },
  });
}
