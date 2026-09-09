import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createMessage } from '@/features/messages/message.service';
import { prisma } from '@/lib/prisma';
import { sendHumanWhatsAppReply } from '@/features/whatsapp/send';
import { readJsonBody } from '@/lib/http';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.businessId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { id: conversationId } = await params;

  try {
    const body = await readJsonBody(req);
    const messageText = typeof body.message === 'string' ? body.message.trim() : '';

    if (!messageText) {
      return NextResponse.json({ error: 'Message body cannot be empty' }, { status: 400 });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, businessId: session.user.businessId },
      include: { customer: true },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const message = await createMessage(
      session.user.id,
      session.user.businessId,
      conversationId,
      {
        authorType: 'HUMAN',
        direction: 'OUTBOUND',
        status: 'PENDING',
        channel: conversation.channel ?? 'internal',
        body: messageText,
      },
    );

    // If channel is whatsapp, transmit outbound message to WhatsApp and only
    // then mark the human-authored message as sent.
    if (conversation.channel === 'whatsapp' && conversation.customer) {
      try {
        await sendHumanWhatsAppReply({
          businessId: session.user.businessId,
          conversationId,
          messageId: message.id,
          customerId: conversation.customerId,
          replyText: messageText,
        });
        await prisma.message.update({
          where: { id: message.id },
          data: { status: 'SENT' },
        });
        return NextResponse.json(
          { ...message, status: 'SENT' },
          { status: 201 },
        );
      } catch (err) {
        await prisma.message.update({
          where: { id: message.id },
          data: { status: 'FAILED' },
        });
        const error = err as { statusCode?: number; status?: number; message?: string };
        const status = error.statusCode || error.status || 500;
        return NextResponse.json(
          {
            error:
              error.message ||
              'Failed to send the reply over WhatsApp. The message was saved but not delivered.',
          },
          { status },
        );
      }
    }

    return NextResponse.json(message, { status: 201 });
  } catch (e: unknown) {
    const error = e as { statusCode?: number; status?: number; message?: string };
    const status = error.statusCode || error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}
