import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { AppError } from '../../lib/errors';
import { Prisma } from '@prisma/client';
import {
  createMessageSchema,
  listMessagesSchema,
  parseOrThrow,
} from './validation';
import { logger } from '../../lib/logger';

const CONVERSATIONS_SCOPE = 'conversations' as const;

async function resolveMembership(userId: string, requestedBusinessId: string) {
  return requireScope(userId, requestedBusinessId, CONVERSATIONS_SCOPE);
}

async function verifyConversation(
  businessId: string,
  conversationId: string,
): Promise<void> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId },
    select: { id: true },
  });
  if (!conversation) {
    throw new AppError('UNKNOWN_CONVERSATION', 'Conversation not found.');
  }
}

export type MessageRecord = Prisma.MessageGetPayload<Record<string, never>>;

export async function createMessage(
  userId: string,
  requestedBusinessId: string,
  conversationId: string,
  input: unknown,
): Promise<MessageRecord> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  await verifyConversation(membership.businessId, conversationId);
  const data = parseOrThrow(createMessageSchema, input);

  const createData: Prisma.MessageCreateInput = {
    business: { connect: { id: membership.businessId } },
    conversation: { connect: { id: conversationId } },
    authorType: data.authorType,
    channel: data.channel,
    body: data.body,
    ...(data.providerMessageId != null
      ? { providerMessageId: data.providerMessageId }
      : {}),
  };

  try {
    return await prisma.message.create({ data: createData });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await prisma.message.findFirst({
        where: {
          businessId: membership.businessId,
          channel: data.channel,
          providerMessageId: data.providerMessageId ?? undefined,
        },
      });
      if (existing) {
        logger.info('message.deduplicated', {
          businessId: membership.businessId,
          channel: data.channel,
        });
        return existing;
      }
    }
    throw error;
  }
}

export async function getMessages(
  userId: string,
  requestedBusinessId: string,
  conversationId: string,
  input: unknown = {},
): Promise<{ items: MessageRecord[]; nextCursor: string | null }> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  await verifyConversation(membership.businessId, conversationId);
  const data = parseOrThrow(listMessagesSchema, input);

  const limit = data.limit ?? 50;

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      businessId: membership.businessId,
    },
    orderBy: { createdAt: 'asc' },
    take: limit + 1,
    ...(data.cursor
      ? {
          cursor: { id: data.cursor },
          skip: 1,
        }
      : {}),
  });

  const hasMore = messages.length > limit;
  const items = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return { items, nextCursor };
}
