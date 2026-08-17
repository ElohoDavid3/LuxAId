import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { AppError } from '../../lib/errors';
import { Prisma } from '@prisma/client';
import {
  createConversationSchema,
  listConversationsSchema,
  parseOrThrow,
} from './validation';

const CONVERSATIONS_SCOPE = 'conversations' as const;

async function resolveMembership(userId: string, requestedBusinessId: string) {
  return requireScope(userId, requestedBusinessId, CONVERSATIONS_SCOPE);
}

const conversationInclude = {
  customer: true,
  _count: {
    select: { messages: true, escalations: true },
  },
} satisfies Prisma.ConversationInclude;

export type ConversationWithRelations = Prisma.ConversationGetPayload<{
  include: typeof conversationInclude;
}>;

export async function createConversation(
  userId: string,
  requestedBusinessId: string,
  input: unknown,
): Promise<ConversationWithRelations> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(createConversationSchema, input);

  const customer = await prisma.customer.findFirst({
    where: { id: data.customerId, businessId: membership.businessId },
    select: { id: true },
  });
  if (!customer) {
    throw new AppError('UNKNOWN_CUSTOMER', 'Customer not found.');
  }

  return prisma.conversation.create({
    data: {
      businessId: membership.businessId,
      customerId: data.customerId,
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.controlState !== undefined
        ? { controlState: data.controlState }
        : {}),
    },
    include: conversationInclude,
  });
}

export async function getConversation(
  userId: string,
  requestedBusinessId: string,
  conversationId: string,
): Promise<ConversationWithRelations> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId: membership.businessId },
    include: conversationInclude,
  });
  if (!conversation) {
    throw new AppError('UNKNOWN_CONVERSATION', 'Conversation not found.');
  }
  return conversation;
}

export async function listConversations(
  userId: string,
  requestedBusinessId: string,
  input: unknown = {},
): Promise<{ items: ConversationWithRelations[]; total: number }> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(listConversationsSchema, input);
  const where: Prisma.ConversationWhereInput = {
    businessId: membership.businessId,
    ...(data.status !== undefined ? { status: data.status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: conversationInclude,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.conversation.count({ where }),
  ]);
  return { items, total };
}
