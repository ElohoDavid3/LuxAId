import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/session';
import { Card } from '@/components/Card/Card';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { EmptyState } from '@/components/EmptyState/EmptyState';
import styles from './conversations.module.css';

export const metadata: Metadata = { title: 'Conversations' };

async function getConversations(businessId: string, filter?: string) {
  const where: Record<string, unknown> = { businessId };
  if (filter === 'escalated') {
    where.OR = [
      { controlState: 'PENDING_HANDOFF' },
      { escalations: { some: { status: { in: ['OPEN', 'ASSIGNED'] } } } },
    ];
  } else if (filter === 'ai') {
    where.controlState = 'AI_CONTROLLED';
  } else if (filter === 'human') {
    where.controlState = 'HUMAN_CONTROLLED';
  } else if (filter && filter !== 'all') {
    where.status = filter;
  }

  const conversations = await prisma.conversation.findMany({
    where,
    take: 50,
    orderBy: { updatedAt: 'desc' },
    include: {
      customer: { select: { name: true } },
      messages: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: { body: true, createdAt: true },
      },
      _count: { select: { messages: true, escalations: true } },
      escalations: {
        where: { status: { in: ['OPEN', 'ASSIGNED'] } },
        take: 1,
        select: { id: true, reason: true, status: true, assigneeId: true },
      },
    },
  });

  return conversations.map((c) => ({
    id: c.id,
    customerName: c.customer.name,
    channel: c.channel ?? 'internal',
    status: c.status,
    controlState: c.controlState,
    lastMessage: c.messages[0]?.body ?? '',
    lastMessageAt: c.messages[0]?.createdAt?.toISOString() ?? c.createdAt.toISOString(),
    messageCount: c._count.messages,
    escalationCount: c._count.escalations,
    activeEscalation: c.escalations[0] ?? null,
    updatedAt: c.updatedAt.toISOString(),
  }));
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const CONTROL_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Escalated', value: 'escalated' },
  { label: 'AI', value: 'ai' },
  { label: 'Human', value: 'human' },
];

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await requireDashboardSession();
  const { filter } = await searchParams;
  const conversations = await getConversations(session.businessId, filter);

  return (
    <div>
      <div style={{ padding: '1.5rem 2rem' }}>
        {/* Filter tabs */}
        <div className={styles.filterTabs} role="tablist" aria-label="Conversation filter">
          {CONTROL_FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value === 'all' ? '/conversations' : `/conversations?filter=${f.value}`}
              role="tab"
              aria-selected={(!filter && f.value === 'all') || filter === f.value}
              className={`${styles.filterTab} ${(!filter && f.value === 'all') || filter === f.value ? styles.active : ''}`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {/* Conversation list */}
        <Card shadow>
          {conversations.length === 0 ? (
            <EmptyState
              heading="No conversations"
              body={filter && filter !== 'all' ? 'No conversations match this filter.' : 'Customer conversations will appear here.'}
              icon={
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7l-4 4V5Z" clipRule="evenodd" />
                </svg>
              }
            />
          ) : (
            <div className={styles.convList}>
              {conversations.map((conv) => (
                <Link
                  key={conv.id}
                  href={`/conversations/${conv.id}`}
                  className={styles.convItem}
                >
                  <div className={styles.convAvatar} aria-hidden="true">
                    {initials(conv.customerName)}
                  </div>
                  <div className={styles.convBody}>
                    <div className={styles.convTopRow}>
                      <span className={styles.convName}>{conv.customerName}</span>
                      <span className={styles.convTime}>{formatTime(conv.lastMessageAt)}</span>
                    </div>
                    <div className={styles.convSnippet}>
                      {conv.lastMessage || 'No messages yet'}
                    </div>
                    <div className={styles.convMeta}>
                      <StatusBadge status={conv.controlState} showDot={false} />
                      {conv.activeEscalation && (
                        <StatusBadge status="HUMAN" label="Escalated" showDot />
                      )}
                      <span className={styles.convChannel}>{conv.channel}</span>
                      <span className={styles.convCount}>{conv.messageCount} msgs</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
