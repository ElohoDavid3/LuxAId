import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/session';
import { Topbar } from '@/components/Topbar/Topbar';
import { Card } from '@/components/Card/Card';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { Button } from '@/components/Button/Button';
import styles from '../conversations.module.css';

export const metadata: Metadata = { title: 'Conversation' };

function formatTime(iso: Date | string) {
  return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireDashboardSession();
  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({
    where: { id, businessId: session.businessId },
    include: {
      customer: { select: { name: true, phone: true, email: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          body: true,
          authorType: true,
          direction: true,
          channel: true,
          createdAt: true,
        },
      },
      escalations: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          assignee: { select: { name: true } },
        },
      },
    },
  });

  if (!conversation) notFound();

  const activeEscalation = conversation.escalations.find(
    (e) => e.status === 'OPEN' || e.status === 'ASSIGNED',
  );

  const isHumanControlled = conversation.controlState === 'HUMAN_CONTROLLED';
  const isPendingHandoff = conversation.controlState === 'PENDING_HANDOFF';

  const breadcrumbs = [
    { label: 'Conversations', href: '/conversations' },
    { label: conversation.customer.name },
  ];

  return (
    <div>
      <Topbar title={`Conversation with ${conversation.customer.name}`} breadcrumbs={breadcrumbs} />
      <div style={{ padding: '1.5rem 2rem' }}>
        <div className={styles.detailGrid}>
          {/* Left: messages */}
          <div>
            <Card shadow>
              <Card.Header>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <Card.Title>Messages</Card.Title>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <StatusBadge status={conversation.controlState} />
                    <StatusBadge status={conversation.status} />
                  </div>
                </div>
              </Card.Header>

              {conversation.messages.length === 0 ? (
                <Card.Body>
                  <p style={{ color: 'var(--color-on-surface-variant)', textAlign: 'center', padding: '2rem' }}>
                    No messages in this conversation yet.
                  </p>
                </Card.Body>
              ) : (
                <div className={styles.messageList}>
                  {conversation.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`${styles.message} ${
                        msg.authorType === 'AI' ? styles.ai :
                        msg.authorType === 'HUMAN' ? styles.human :
                        msg.authorType === 'SYSTEM' ? styles.system :
                        styles.customer
                      }`}
                    >
                      <div>
                        <div className={styles.messageBubble}>{msg.body}</div>
                        <div className={styles.messageTime}>
                          {msg.authorType} \u00B7 {formatTime(msg.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Action bar */}
              <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--color-outline-variant)' }}>
                <div className={styles.actionBar}>
                  {isPendingHandoff && (
                    <form action="/api/conversations/takeover" method="POST">
                      <input type="hidden" name="conversationId" value={conversation.id} />
                      <Button variant="primary" type="submit">
                        Take over conversation
                      </Button>
                    </form>
                  )}
                  {isHumanControlled && activeEscalation?.assigneeId === session.userId && (
                    <form action="/api/conversations/release" method="POST">
                      <input type="hidden" name="conversationId" value={conversation.id} />
                      <input type="hidden" name="escalationId" value={activeEscalation.id} />
                      <Button variant="secondary" type="submit">
                        Release to AI
                      </Button>
                    </form>
                  )}
                  {!isPendingHandoff && !isHumanControlled && (
                    <span style={{ color: 'var(--color-on-surface-variant)', fontSize: 'var(--type-dr-body-small-font-size)' }}>
                      {conversation.controlState === 'AI_CONTROLLED' ? 'AI is handling this conversation' : 'No actions available'}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Right: customer info + escalations */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Customer */}
            <Card shadow padded>
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontFamily: 'var(--type-dr-label-medium-font-family)', fontSize: 'var(--type-dr-label-medium-font-size)', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
                  Customer
                </div>
                <div style={{ fontFamily: 'var(--type-dr-body-large-font-family)', fontSize: 'var(--type-dr-body-large-font-size)', fontWeight: 500, color: 'var(--color-on-surface)' }}>
                  {conversation.customer.name}
                </div>
              </div>
              {conversation.customer.phone && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={{ fontFamily: 'var(--type-dr-label-medium-font-family)', fontSize: 'var(--type-dr-label-medium-font-size)', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.125rem' }}>
                    Phone
                  </div>
                  <div style={{ fontSize: 'var(--type-dr-body-medium-font-size)' }}>{conversation.customer.phone}</div>
                </div>
              )}
              {conversation.customer.email && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={{ fontFamily: 'var(--type-dr-label-medium-font-family)', fontSize: 'var(--type-dr-label-medium-font-size)', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.125rem' }}>
                    Email
                  </div>
                  <div style={{ fontSize: 'var(--type-dr-body-medium-font-size)' }}>{conversation.customer.email}</div>
                </div>
              )}
              <div>
                <div style={{ fontFamily: 'var(--type-dr-label-medium-font-family)', fontSize: 'var(--type-dr-label-medium-font-size)', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.125rem' }}>
                  Channel
                </div>
                <div style={{ fontSize: 'var(--type-dr-body-medium-font-size)', textTransform: 'uppercase' }}>{conversation.channel ?? 'internal'}</div>
              </div>
            </Card>

            {/* Escalations */}
            <Card shadow padded>
              <div style={{ fontFamily: 'var(--type-dr-label-medium-font-family)', fontSize: 'var(--type-dr-label-medium-font-size)', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
                Escalations
              </div>
              {conversation.escalations.length === 0 ? (
                <p style={{ color: 'var(--color-on-surface-variant)', fontSize: 'var(--type-dr-body-small-font-size)' }}>
                  No escalations for this conversation.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {conversation.escalations.map((esc) => (
                    <div
                      key={esc.id}
                      className={`${styles.escalationCard} ${esc.status === 'RESOLVED' ? styles.resolved : ''}`}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <StatusBadge status={esc.status} />
                        <span style={{ fontSize: 'var(--type-dr-label-small-font-size)', color: 'var(--color-on-surface-variant)' }}>
                          {formatTime(esc.createdAt)}
                        </span>
                      </div>
                      <div className={styles.escalationReason}>{esc.reason}</div>
                      {esc.assignee && (
                        <div style={{ fontSize: 'var(--type-dr-label-small-font-size)', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>
                          Assigned to: {esc.assignee.name}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
