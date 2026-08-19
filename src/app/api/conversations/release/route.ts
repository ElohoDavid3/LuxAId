import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ConversationControlState, EscalationStatus } from '@prisma/client';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const businessId = session.user.businessId;
  if (!businessId) {
    return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
  }

  const body = await req.json();
  const conversationId = body.conversationId as string;
  const escalationId = body.escalationId as string;
  if (!conversationId || !escalationId) {
    return NextResponse.json({ error: 'conversationId and escalationId are required' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Verify conversation belongs to this business and is in HUMAN_CONTROLLED state
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, businessId },
        select: { id: true, controlState: true },
      });
      if (!conversation) {
        throw new Error('CONVERSATION_NOT_FOUND');
      }
      if (conversation.controlState !== ConversationControlState.HUMAN_CONTROLLED) {
        throw new Error('STATE_CONFLICT');
      }

      // Verify escalation is ASSIGNED to the current user
      const escalation = await tx.escalation.findFirst({
        where: {
          id: escalationId,
          conversationId,
          businessId,
          status: EscalationStatus.ASSIGNED,
          assigneeId: session.user.id,
        },
      });
      if (!escalation) {
        throw new Error('ESCALATION_NOT_FOUND');
      }

      // Resolve the escalation
      await tx.escalation.update({
        where: { id: escalationId },
        data: {
          status: EscalationStatus.RESOLVED,
          resolvedAt: new Date(),
        },
      });

      // Transition conversation back to AI_CONTROLLED
      await tx.conversation.update({
        where: { id: conversationId },
        data: { controlState: ConversationControlState.AI_CONTROLLED },
      });

      // Audit
      await tx.auditLog.create({
        data: {
          businessId,
          eventType: 'HUMAN_RELEASE',
          actorType: 'USER',
          actorId: session.user.id,
          payload: { conversationId, escalationId },
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
      return NextResponse.json({ error: 'Conversation is not under human control' }, { status: 409 });
    }
    if (message === 'ESCALATION_NOT_FOUND') {
      return NextResponse.json({ error: 'Escalation not found or not assigned to you' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
