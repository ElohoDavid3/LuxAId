import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ConversationControlState, EscalationStatus } from '@prisma/client';
import { requireScope } from '@/features/auth/authorization';
import { AppError } from '@/lib/errors';
import { readJsonBody } from '@/lib/http';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const businessId = session.user.businessId;
  if (!businessId) {
    return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
  }

  let membership;
  try {
    membership = await requireScope(session.user.id, businessId, 'conversations');
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Invalid request' },
      { status },
    );
  }
  const conversationId = body.conversationId as string;
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, businessId: membership.businessId },
        select: { id: true, controlState: true },
      });
      if (!conversation) {
        throw new Error('CONVERSATION_NOT_FOUND');
      }
      if (conversation.controlState !== ConversationControlState.PENDING_HANDOFF) {
        throw new Error('STATE_CONFLICT');
      }

      const escalation = await tx.escalation.findFirst({
        where: {
          conversationId,
          businessId: membership.businessId,
          status: EscalationStatus.OPEN,
        },
      });
      if (!escalation) {
        throw new Error('NO_ACTIVE_ESCALATION');
      }

      const { count } = await tx.escalation.updateMany({
        where: {
          id: escalation.id,
          status: EscalationStatus.OPEN,
        },
        data: {
          status: EscalationStatus.ASSIGNED,
          assigneeId: session.user.id,
        },
      });

      if (count === 0) {
        throw new Error('CONCURRENT_TAKEOVER');
      }

      await tx.conversation.update({
        where: { id: conversationId },
        data: { controlState: ConversationControlState.HUMAN_CONTROLLED },
      });

      await tx.auditLog.create({
        data: {
          businessId: membership.businessId,
          eventType: 'HUMAN_TAKEOVER',
          actorType: 'USER',
          actorId: session.user.id,
          payload: { conversationId, escalationId: escalation.id },
        },
      });

      return { success: true };
    });

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    if (message === 'CONVERSATION_NOT_FOUND') {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    if (message === 'STATE_CONFLICT') {
      return NextResponse.json({ error: 'Conversation is not pending handoff' }, { status: 409 });
    }
    if (message === 'NO_ACTIVE_ESCALATION') {
      return NextResponse.json({ error: 'No active escalation found' }, { status: 409 });
    }
    if (message === 'CONCURRENT_TAKEOVER') {
      return NextResponse.json({ error: 'Another operator took control first' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
