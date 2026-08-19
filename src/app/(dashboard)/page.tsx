import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/session';
import { Topbar } from '@/components/Topbar/Topbar';
import { DashboardWidget } from '@/components/DashboardWidget';
import { Card } from '@/components/Card/Card';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { EmptyState } from '@/components/EmptyState/EmptyState';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Dashboard',
};

async function getDashboardSummary(businessId: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [todayOrders, todayRevenue, openConversations, lowStockCount, pendingEscalations, paymentIssues] = await Promise.all([
    prisma.order.count({
      where: { businessId, createdAt: { gte: startOfDay } },
    }),
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: {
        businessId,
        status: 'PAID',
        createdAt: { gte: startOfDay },
      },
    }),
    prisma.conversation.count({
      where: {
        businessId,
        status: { in: ['NEW', 'ACTIVE', 'WAITING_FOR_CUSTOMER'] },
      },
    }),
    prisma.inventory.count({
      where: {
        businessId,
        available: { lte: 5 },
      },
    }),
    prisma.escalation.count({
      where: {
        businessId,
        status: { in: ['OPEN', 'ASSIGNED'] },
      },
    }),
    prisma.paymentAttempt.count({
      where: {
        businessId,
        status: 'FAILED',
      },
    }),
  ]);

  return {
    todayOrders,
    todayRevenue: todayRevenue._sum.totalAmount ?? 0,
    openConversations,
    lowStockCount,
    pendingEscalations,
    paymentIssues,
  };
}

async function getRecentOrders(businessId: string) {
  const orders = await prisma.order.findMany({
    where: { businessId },
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { name: true } },
    },
  });

  return orders.map((o) => ({
    id: o.id,
    reference: o.id.slice(-6).toUpperCase(),
    customerName: o.customer.name,
    status: o.status,
    totalAmount: o.totalAmount,
    createdAt: o.createdAt.toISOString(),
  }));
}

async function getRecentConversations(businessId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { businessId },
    take: 5,
    orderBy: { updatedAt: 'desc' },
    include: {
      customer: { select: { name: true } },
      messages: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: { body: true },
      },
    },
  });

  return conversations.map((c) => ({
    id: c.id,
    customerName: c.customer.name,
    lastMessage: c.messages[0]?.body ?? '',
    controlState: c.controlState,
    status: c.status,
    updatedAt: c.updatedAt.toISOString(),
  }));
}

function formatNaira(kobo: number) {
  return '\u20A6' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default async function DashboardPage() {
  const session = await requireDashboardSession();

  const [summary, recentOrders, recentConversations] = await Promise.all([
    getDashboardSummary(session.businessId),
    getRecentOrders(session.businessId),
    getRecentConversations(session.businessId),
  ]);

  const hasIssues = summary.pendingEscalations > 0 || summary.paymentIssues > 0;

  return (
    <div className={styles.page}>
      <Topbar title="Dashboard" />

      <div style={{ padding: '1.5rem 2rem' }}>
        {/* -- Attention strip -- */}
        {hasIssues ? (
          <div className={styles.attentionStrip}>
            <span className={styles.attentionLabel}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
              </svg>
              Needs attention
            </span>
            <div className={styles.attentionItems}>
              {summary.pendingEscalations > 0 && (
                <Link href="/conversations?filter=escalated">
                  <StatusBadge status="HUMAN" label={`${summary.pendingEscalations} escalation${summary.pendingEscalations !== 1 ? 's' : ''}`} showDot />
                </Link>
              )}
              {summary.paymentIssues > 0 && (
                <Link href="/orders?filter=payment_issue">
                  <StatusBadge status="FAILED" label={`${summary.paymentIssues} payment issue${summary.paymentIssues !== 1 ? 's' : ''}`} showDot />
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className={`${styles.attentionStrip} ${styles.clean}`}>
            <span className={`${styles.attentionLabel}`}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
              </svg>
              All caught up — no pending issues
            </span>
          </div>
        )}

        {/* -- Stats row -- */}
        <div className={styles.statsGrid}>
          <DashboardWidget
            title="Today's orders"
            value={summary.todayOrders}
            caption="orders placed today"
            highlight={summary.todayOrders > 0}
            icon={
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.414A2 2 0 0 0 15.414 6L12 2.586A2 2 0 0 0 10.586 2H6Zm2 10a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H8Zm0-3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H8Z" clipRule="evenodd" />
              </svg>
            }
          />
          <DashboardWidget
            title="Today's revenue"
            value={formatNaira(summary.todayRevenue)}
            caption="verified payments"
            icon={
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.75 10.818v2.614A3.13 3.13 0 0 0 11.888 13c.482-.315.612-.648.612-.875 0-.227-.13-.56-.612-.875a3.13 3.13 0 0 0-1.138-.432ZM8.33 8.62c.053.055.115.11.184.164.208.16.46.284.736.363V6.603a2.45 2.45 0 0 0-.35.13c-.14.065-.27.143-.386.233-.377.292-.514.627-.514.909 0 .184.058.39.33.576Z" />
                <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-6a.75.75 0 0 1 .75.75v.316a3.78 3.78 0 0 1 1.653.713c.426.33.744.74.925 1.2a.75.75 0 0 1-1.395.55 1.35 1.35 0 0 0-.447-.563 2.187 2.187 0 0 0-.736-.363V9.3c.698.484 1.447.484 1.961.899.578.47.914 1.084.914 1.725 0 .63-.306 1.288-.94 1.772a4.006 4.006 0 0 1-1.935.63V14.5a.75.75 0 0 1-1.5 0v-.54a4.068 4.068 0 0 1-1.994-.902c-.468-.417-.836-.982-.836-1.629a.75.75 0 0 1 1.5 0c0 .033.016.186.338.313.228.087.277.09.492.103V9.255a3.818 3.818 0 0 1-1.364-.673C6.81 8.163 6.5 7.51 6.5 6.75c0-.698.326-1.375.94-1.865a3.95 3.95 0 0 1 1.81-.71V4.75A.75.75 0 0 1 10 4Z" clipRule="evenodd" />
              </svg>
            }
          />
          <DashboardWidget
            title="Open conversations"
            value={summary.openConversations}
            caption="active customer chats"
            highlight={summary.openConversations > 10}
            icon={
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7l-4 4V5Z" clipRule="evenodd" />
              </svg>
            }
          />
          <DashboardWidget
            title="Low stock products"
            value={summary.lowStockCount}
            caption="need restocking"
            highlight={summary.lowStockCount > 0}
            icon={
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3ZM2 9.5a.5.5 0 0 1 .5-.5h15a.5.5 0 0 1 0 1h-15a.5.5 0 0 1-.5-.5ZM2 13.5a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1h-10a.5.5 0 0 1-.5-.5ZM2 17.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5Z" />
              </svg>
            }
          />
        </div>

        {/* -- Two-column: recent orders + conversations -- */}
        <div className={styles.twoCol}>
          {/* Recent Orders */}
          <Card shadow>
            <Card.Header>
              <div className={styles.sectionHeader}>
                <Card.Title>Recent orders</Card.Title>
                <Link href="/orders" className={styles.viewAll}>View all</Link>
              </div>
            </Card.Header>
            {recentOrders.length === 0 ? (
              <EmptyState
                heading="No orders yet"
                body="Orders from your customers will appear here."
                icon={
                  <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.414A2 2 0 0 0 15.414 6L12 2.586A2 2 0 0 0 10.586 2H6Zm2 10a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H8Zm0-3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H8Z" clipRule="evenodd" />
                  </svg>
                }
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--type-dr-body-small-font-size)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-outline-variant)', background: 'var(--color-surface-container-low)' }}>
                      <th style={{ padding: '0.625rem 1.25rem', textAlign: 'left', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--type-dr-label-medium-font-family)', fontSize: 'var(--type-dr-label-medium-font-size)' }}>Order</th>
                      <th style={{ padding: '0.625rem 1.25rem', textAlign: 'left', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--type-dr-label-medium-font-family)', fontSize: 'var(--type-dr-label-medium-font-size)' }}>Customer</th>
                      <th style={{ padding: '0.625rem 1.25rem', textAlign: 'left', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--type-dr-label-medium-font-family)', fontSize: 'var(--type-dr-label-medium-font-size)' }}>Status</th>
                      <th style={{ padding: '0.625rem 1.25rem', textAlign: 'right', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--type-dr-label-medium-font-family)', fontSize: 'var(--type-dr-label-medium-font-size)' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order.id} style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
                        <td style={{ padding: '0.75rem 1.25rem' }}>
                          <Link href={`/orders/${order.id}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                            #{order.reference}
                          </Link>
                        </td>
                        <td style={{ padding: '0.75rem 1.25rem', color: 'var(--color-on-surface)' }}>{order.customerName}</td>
                        <td style={{ padding: '0.75rem 1.25rem' }}><StatusBadge status={order.status} /></td>
                        <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right', fontWeight: 600 }}>{formatNaira(order.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Recent Conversations */}
          <Card shadow>
            <Card.Header>
              <div className={styles.sectionHeader}>
                <Card.Title>Recent conversations</Card.Title>
                <Link href="/conversations" className={styles.viewAll}>View all</Link>
              </div>
            </Card.Header>
            {recentConversations.length === 0 ? (
              <EmptyState
                heading="No conversations yet"
                body="Customer conversations will show up here."
                icon={
                  <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7l-4 4V5Z" clipRule="evenodd" />
                  </svg>
                }
              />
            ) : (
              <div className={styles.convList}>
                {recentConversations.map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/conversations/${conv.id}`}
                    className={styles.convItem}
                  >
                    <div className={styles.convAvatar} aria-hidden="true">
                      {initials(conv.customerName)}
                    </div>
                    <div className={styles.convBody}>
                      <div className={styles.convName}>{conv.customerName}</div>
                      <div className={styles.convSnippet}>{conv.lastMessage}</div>
                    </div>
                    <div className={styles.convMeta}>
                      <span className={styles.convTime}>{formatTime(conv.updatedAt)}</span>
                      <StatusBadge status={conv.controlState} showDot={false} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
