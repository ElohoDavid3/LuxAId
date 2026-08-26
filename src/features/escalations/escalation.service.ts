import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { AppError } from '../../lib/errors';
import { EscalationStatus, MembershipStatus, Prisma } from '@prisma/client';
import {
  assignEscalationSchema,
  cancelEscalationSchema,
  createEscalationSchema,
  parseOrThrow,
  reassignEscalationSchema,
} from './validation';
import { logAudit } from '../auth/audit';

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

export type EscalationRecord = Prisma.EscalationGetPayload<
  Record<string, never>
>;

export async function createEscalation(
  userId: string,
  requestedBusinessId: string,
  conversationId: string,
  input: unknown,
): Promise<EscalationRecord> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  await verifyConversation(membership.businessId, conversationId);
  const data = parseOrThrow(createEscalationSchema, input);

  try {
    const escalation = await prisma.escalation.create({
      data: {
        businessId: membership.businessId,
        conversationId,
        reason: data.reason,
        status: EscalationStatus.OPEN,
      },
    });

    await logAudit({
      businessId: membership.businessId,
      eventType: 'ESCALATION_CREATED',
      actorType: 'USER',
      actorId: userId,
      payload: {
        escalationId: escalation.id,
        conversationId,
        reason: data.reason,
      },
    });

    return escalation;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new AppError(
        'STATE_CONFLICT',
        'An active escalation already exists for this conversation.',
      );
    }
    throw error;
  }
}

export async function assignEscalation(
  userId: string,
  requestedBusinessId: string,
  escalationId: string,
  input: unknown,
): Promise<EscalationRecord> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(assignEscalationSchema, input);

  const assigneeMembership = await prisma.businessMembership.findUnique({
    where: {
      businessId_userId: {
        businessId: membership.businessId,
        userId: data.assigneeId,
      },
    },
  });
  if (
    !assigneeMembership ||
    assigneeMembership.status !== MembershipStatus.ACTIVE
  ) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Assignee is not an active member of this business.',
    );
  }

  const { count } = await prisma.escalation.updateMany({
    where: {
      id: escalationId,
      businessId: membership.businessId,
      status: EscalationStatus.OPEN,
    },
    data: {
      status: EscalationStatus.ASSIGNED,
      assigneeId: data.assigneeId,
    },
  });

  if (count === 0) {
    const escalation = await prisma.escalation.findFirst({
      where: { id: escalationId, businessId: membership.businessId },
      select: { id: true, status: true },
    });
    if (!escalation) {
      throw new AppError('UNKNOWN_ESCALATION', 'Escalation not found.');
    }
    throw new AppError(
      'STATE_CONFLICT',
      `Cannot assign escalation in ${escalation.status} status.`,
    );
  }

  const updated = await prisma.escalation.findUniqueOrThrow({
    where: { id: escalationId },
  });

  await logAudit({
    businessId: membership.businessId,
    eventType: 'ESCALATION_ASSIGNED',
    actorType: 'USER',
    actorId: userId,
    payload: {
      escalationId,
      assigneeId: data.assigneeId,
    },
  });

  return updated;
}

export async function resolveEscalation(
  userId: string,
  requestedBusinessId: string,
  escalationId: string,
): Promise<EscalationRecord> {
  const membership = await resolveMembership(userId, requestedBusinessId);

  const { count } = await prisma.escalation.updateMany({
    where: {
      id: escalationId,
      businessId: membership.businessId,
      status: EscalationStatus.ASSIGNED,
    },
    data: {
      status: EscalationStatus.RESOLVED,
      resolvedAt: new Date(),
    },
  });

  if (count === 0) {
    const escalation = await prisma.escalation.findFirst({
      where: { id: escalationId, businessId: membership.businessId },
      select: { id: true, status: true },
    });
    if (!escalation) {
      throw new AppError('UNKNOWN_ESCALATION', 'Escalation not found.');
    }
    throw new AppError(
      'STATE_CONFLICT',
      `Cannot resolve escalation in ${escalation.status} status.`,
    );
  }

  const updated = await prisma.escalation.findUniqueOrThrow({
    where: { id: escalationId },
  });

  await logAudit({
    businessId: membership.businessId,
    eventType: 'ESCALATION_RESOLVED',
    actorType: 'USER',
    actorId: userId,
    payload: {
      escalationId,
    },
  });

  return updated;
}

export async function cancelEscalation(
  userId: string,
  requestedBusinessId: string,
  escalationId: string,
  input: unknown = {},
): Promise<EscalationRecord> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  parseOrThrow(cancelEscalationSchema, input);

  const { count } = await prisma.escalation.updateMany({
    where: {
      id: escalationId,
      businessId: membership.businessId,
      status: EscalationStatus.OPEN,
    },
    data: {
      status: EscalationStatus.CANCELLED,
      resolvedAt: new Date(),
    },
  });

  if (count === 0) {
    const escalation = await prisma.escalation.findFirst({
      where: { id: escalationId, businessId: membership.businessId },
      select: { id: true, status: true },
    });
    if (!escalation) {
      throw new AppError('UNKNOWN_ESCALATION', 'Escalation not found.');
    }
    throw new AppError(
      'STATE_CONFLICT',
      `Cannot cancel escalation in ${escalation.status} status.`,
    );
  }

  const updated = await prisma.escalation.findUniqueOrThrow({
    where: { id: escalationId },
  });

  await logAudit({
    businessId: membership.businessId,
    eventType: 'ESCALATION_CANCELLED',
    actorType: 'USER',
    actorId: userId,
    payload: {
      escalationId,
    },
  });

  return updated;
}

export async function reassignEscalation(
  userId: string,
  requestedBusinessId: string,
  escalationId: string,
): Promise<EscalationRecord> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  parseOrThrow(reassignEscalationSchema, {});

  const { count } = await prisma.escalation.updateMany({
    where: {
      id: escalationId,
      businessId: membership.businessId,
      status: EscalationStatus.ASSIGNED,
    },
    data: {
      status: EscalationStatus.OPEN,
      assigneeId: null,
    },
  });

  if (count === 0) {
    const escalation = await prisma.escalation.findFirst({
      where: { id: escalationId, businessId: membership.businessId },
      select: { id: true, status: true },
    });
    if (!escalation) {
      throw new AppError('UNKNOWN_ESCALATION', 'Escalation not found.');
    }
    throw new AppError(
      'STATE_CONFLICT',
      `Cannot reassign escalation in ${escalation.status} status.`,
    );
  }

  const updated = await prisma.escalation.findUniqueOrThrow({
    where: { id: escalationId },
  });

  await logAudit({
    businessId: membership.businessId,
    eventType: 'ESCALATION_REASSIGNED',
    actorType: 'USER',
    actorId: userId,
    payload: {
      escalationId,
    },
  });

  return updated;
}
