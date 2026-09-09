import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { AppError } from '../../lib/errors';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const KNOWLEDGE_SCOPE = 'business_admin' as const;

async function resolveMembership(userId: string, requestedBusinessId: string) {
  return requireScope(userId, requestedBusinessId, KNOWLEDGE_SCOPE);
}

export type KnowledgeRecord = Prisma.KnowledgeSourceGetPayload<
  Record<string, never>
>;

const createKnowledgeSchema = z.object({
  content: z.string().trim().min(1).max(5000),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});

const updateKnowledgeSchema = z.object({
  content: z.string().trim().min(1).max(5000).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  stale: z.boolean().optional(),
});

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

export async function listAllKnowledge(
  userId: string,
  requestedBusinessId: string,
): Promise<KnowledgeRecord[]> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  return prisma.knowledgeSource.findMany({
    where: { businessId: membership.businessId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createKnowledgeSource(
  userId: string,
  requestedBusinessId: string,
  input: unknown,
): Promise<KnowledgeRecord> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = createKnowledgeSchema.parse(input);

  return prisma.knowledgeSource.create({
    data: {
      businessId: membership.businessId,
      content: data.content,
      status: data.status ?? 'ACTIVE',
      stale: false,
      lastVerifiedAt: new Date(),
    },
  });
}

export async function updateKnowledgeSource(
  userId: string,
  requestedBusinessId: string,
  id: string,
  input: unknown,
): Promise<KnowledgeRecord> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = updateKnowledgeSchema.parse(input);

  const existing = await prisma.knowledgeSource.findFirst({
    where: { id, businessId: membership.businessId },
  });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Knowledge source not found.');
  }

  return prisma.knowledgeSource.update({
    where: { id },
    data: {
      ...(data.content !== undefined ? { content: data.content } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.stale !== undefined ? { stale: data.stale } : {}),
      lastVerifiedAt: new Date(),
    },
  });
}

export async function deleteKnowledgeSource(
  userId: string,
  requestedBusinessId: string,
  id: string,
): Promise<void> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const existing = await prisma.knowledgeSource.findFirst({
    where: { id, businessId: membership.businessId },
  });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Knowledge source not found.');
  }

  await prisma.knowledgeSource.delete({
    where: { id },
  });
}
