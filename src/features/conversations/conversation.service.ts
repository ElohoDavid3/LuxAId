import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { AppError } from '../../lib/errors';
import { ConversationControlState, Prisma } from '@prisma/client';
import { logAudit } from '../auth/audit';
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

export async function updateControlState(
  userId: string,
  requestedBusinessId: string,
  conversationId: string,
  expectedState: ConversationControlState,
  newState: ConversationControlState,
): Promise<ConversationWithRelations> {
  const membership = await resolveMembership(userId, requestedBusinessId);

  const { count } = await prisma.conversation.updateMany({
    where: {
      id: conversationId,
      businessId: membership.businessId,
      controlState: expectedState,
    },
    data: { controlState: newState },
  });

  if (count === 0) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, businessId: membership.businessId },
      select: { id: true, controlState: true },
    });
    if (!conversation) {
      throw new AppError('UNKNOWN_CONVERSATION', 'Conversation not found.');
    }
    throw new AppError(
      'STATE_CONFLICT',
      `Cannot transition control state from ${expectedState}; current state is ${conversation.controlState}.`,
    );
  }

  const updated = await prisma.conversation.findFirstOrThrow({
    where: { id: conversationId, businessId: membership.businessId },
    include: conversationInclude,
  });

  await logAudit({
    businessId: membership.businessId,
    eventType: 'CONVERSATION_CONTROL_STATE_CHANGED',
    actorType: 'AI',
    actorId: userId,
    payload: { conversationId, from: expectedState, to: newState },
  });

  return updated;
}
