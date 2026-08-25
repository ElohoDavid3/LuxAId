import type { Metadata } from 'next';
import { requireDashboardSession } from '@/lib/session';
import { DashboardWidget } from '@/components/DashboardWidget';
import { Card } from '@/components/Card/Card';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { EmptyState } from '@/components/EmptyState/EmptyState';
import {
  getAnalyticsSummary,
  getRevenueByDay,
  getOrderStatusBreakdown,
  getTopProducts,
  getConversationMetrics,
} from '@/features/analytics/service';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Analytics',
};

function formatNaira(kobo: number) {
  return '\u20A6' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 });
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default async function AnalyticsPage() {
  const session = await requireDashboardSession();

  const [summary, revenueByDay, orderStatuses, topProducts, convMetrics] =
    await Promise.all([
      getAnalyticsSummary(session.businessId),
      getRevenueByDay(session.businessId, 7),
      getOrderStatusBreakdown(session.businessId),
      getTopProducts(session.businessId, 5),
      getConversationMetrics(session.businessId),
    ]);

  return (
    <div className={styles.page}>
      <div style={{ padding: '1.5rem 2rem' }}>
        {/* ── Summary widgets ──────────────────────────────────────── */}
        <div className={styles.statsGrid}>
          <DashboardWidget
            title="Total revenue"
            value={formatNaira(summary.totalRevenue)}
            caption="all confirmed orders"
            icon={
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.75 10.818v2.614A3.13 3.13 0 0 0 11.888 13c.482-.315.612-.648.612-.875 0-.227-.13-.56-.612-.875a3.13 3.13 0 0 0-1.138-.432ZM8.33 8.62c.053.055.115.11.184.164.208.16.46.284.736.363V6.603a2.45 2.45 0 0 0-.35.13c-.14.065-.27.143-.386.233-.377.292-.514.627-.514.909 0 .184.058.39.33.576Z" />
                <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-6a.75.75 0 0 1 .75.75v.316a3.78 3.78 0 0 1 1.653.713c.426.33.744.74.925 1.2a.75.75 0 0 1-1.395.55 1.35 1.35 0 0 0-.447-.563 2.187 2.187 0 0 0-.736-.363V9.3c.698.484 1.447.484 1.961.899.578.47.914 1.084.914 1.725 0 .63-.306 1.288-.94 1.772a4.006 4.006 0 0 1-1.935.63V14.5a.75.75 0 0 1-1.5 0v-.54a4.068 4.068 0 0 1-1.994-.902c-.468-.417-.836-.982-.836-1.629a.75.75 0 0 1 1.5 0c0 .033.016.186.338.313.228.087.277.09.492.103V9.255a3.818 3.818 0 0 1-1.364-.673C6.81 8.163 6.5 7.51 6.5 6.75c0-.698.326-1.375.94-1.865a3.95 3.95 0 0 1 1.81-.71V4.75A.75.75 0 0 1 10 4Z" clipRule="evenodd" />
              </svg>
            }
          />
          <DashboardWidget
            title="Total orders"
            value={summary.totalOrders}
            caption="lifetime order count"
            icon={
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.414A2 2 0 0 0 15.414 6L12 2.586A2 2 0 0 0 10.586 2H6Zm2 10a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H8Zm0-3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H8Z" clipRule="evenodd" />
              </svg>
            }
          />
          <DashboardWidget
            title="Total customers"
            value={summary.totalCustomers}
            caption="unique customers"
            icon={
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z" />
              </svg>
            }
          />
          <DashboardWidget
            title="Payment success"
            value={`${summary.paymentSuccessRate}%`}
            caption={`${summary.totalOrders > 0 ? formatNaira(summary.averageOrderValue) : '\u20A60'} avg order`}
            icon={
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
              </svg>
            }
          />
        </div>

        {/* ── Two-column: revenue trend + order breakdown ──────────── */}
        <div className={styles.twoCol}>
          {/* Revenue last 7 days */}
          <Card shadow>
            <Card.Header>
              <Card.Title>Revenue (last 7 days)</Card.Title>
            </Card.Header>
            {revenueByDay.every((d) => d.revenue === 0) ? (
              <EmptyState
                heading="No revenue data"
                body="Revenue from paid orders will appear here."
                icon={
                  <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.75 10.818v2.614A3.13 3.13 0 0 0 11.888 13c.482-.315.612-.648.612-.875 0-.227-.13-.56-.612-.875a3.13 3.13 0 0 0-1.138-.432ZM8.33 8.62c.053.055.115.11.184.164.208.16.46.284.736.363V6.603a2.45 2.45 0 0 0-.35.13c-.14.065-.27.143-.386.233-.377.292-.514.627-.514.909 0 .184.058.39.33.576Z" />
                    <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-6a.75.75 0 0 1 .75.75v.316a3.78 3.78 0 0 1 1.653.713c.426.33.744.74.925 1.2a.75.75 0 0 1-1.395.55 1.35 1.35 0 0 0-.447-.563 2.187 2.187 0 0 0-.736-.363V9.3c.698.484 1.447.484 1.961.899.578.47.914 1.084.914 1.725 0 .63-.306 1.288-.94 1.772a4.006 4.006 0 0 1-1.935.63V14.5a.75.75 0 0 1-1.5 0v-.54a4.068 4.068 0 0 1-1.994-.902c-.468-.417-.836-.982-.836-1.629a.75.75 0 0 1 1.5 0c0 .033.016.186.338.313.228.087.277.09.492.103V9.255a3.818 3.818 0 0 1-1.364-.673C6.81 8.163 6.5 7.51 6.5 6.75c0-.698.326-1.375.94-1.865a3.95 3.95 0 0 1 1.81-.71V4.75A.75.75 0 0 1 10 4Z" clipRule="evenodd" />
                  </svg>
                }
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th style={{ textAlign: 'right' }}>Orders</th>
                      <th style={{ textAlign: 'right' }}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueByDay.map((day) => (
                      <tr key={day.date}>
                        <td>{formatDate(day.date)}</td>
                        <td style={{ textAlign: 'right' }}>{day.orders}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {formatNaira(day.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Order status breakdown */}
          <Card shadow>
            <Card.Header>
              <Card.Title>Orders by status</Card.Title>
            </Card.Header>
            {orderStatuses.length === 0 ? (
              <EmptyState
                heading="No orders yet"
                body="Order status breakdown will appear here."
                icon={
                  <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.414A2 2 0 0 0 15.414 6L12 2.586A2 2 0 0 0 10.586 2H6Zm2 10a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H8Zm0-3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H8Z" clipRule="evenodd" />
                  </svg>
                }
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Count</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderStatuses.map((row) => (
                      <tr key={row.status}>
                        <td><StatusBadge status={row.status} /></td>
                        <td style={{ textAlign: 'right' }}>{row.count}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {formatNaira(row.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* ── Two-column: top products + conversation metrics ──────── */}
        <div className={styles.twoCol}>
          {/* Top products */}
          <Card shadow>
            <Card.Header>
              <Card.Title>Top products</Card.Title>
            </Card.Header>
            {topProducts.length === 0 ? (
              <EmptyState
                heading="No product data"
                body="Top-selling products will appear here."
                icon={
                  <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M.99 5.24A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25l.028.102a.75.75 0 0 0 .16.346l2.469 3.84a2.25 2.25 0 0 1-.646 3.12l-.132.102a.75.75 0 0 0-.262.494v4.24a.75.75 0 0 0 .313.61l.134.101A2.25 2.25 0 0 1 16.75 19H3.25A2.25 2.25 0 0 1 1 16.75V6.518a.75.75 0 0 0 .312-.61l-.028-.102a.75.75 0 0 0-.294-.576ZM3.25 4.5a.75.75 0 0 0-.75.75v.028l.028.102a2.25 2.25 0 0 1 .16.346l2.469 3.84a.75.75 0 0 0 .63.34H17.25a.75.75 0 0 0-.596-.3H12a.75.75 0 0 1 0-1.5h4.5a2.25 2.25 0 0 0-2.182-1.716l-.132.102a2.25 2.25 0 0 1-2.813-1.428L10.35 4.5H3.25Z" clipRule="evenodd" />
                  </svg>
                }
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ textAlign: 'right' }}>Qty sold</th>
                      <th style={{ textAlign: 'right' }}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p) => (
                      <tr key={p.productId}>
                        <td style={{ fontWeight: 600 }}>{p.productName}</td>
                        <td style={{ textAlign: 'right' }}>{p.totalQuantity}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {formatNaira(p.totalRevenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Conversation metrics */}
          <Card shadow>
            <Card.Header>
              <Card.Title>Conversations</Card.Title>
            </Card.Header>
            {convMetrics.totalConversations === 0 ? (
              <EmptyState
                heading="No conversations"
                body="Conversation metrics will appear here."
                icon={
                  <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7l-4 4V5Z" clipRule="evenodd" />
                  </svg>
                }
              />
            ) : (
              <div className={styles.metricList}>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Total conversations</span>
                  <span className={styles.metricValue}>{convMetrics.totalConversations}</span>
                </div>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Handled by AI</span>
                  <span className={styles.metricValue}>{convMetrics.aiResolved}</span>
                </div>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Escalated to human</span>
                  <span className={styles.metricValue}>{convMetrics.humanEscalated}</span>
                </div>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Avg. messages per conversation</span>
                  <span className={styles.metricValue}>{convMetrics.avgMessagesPerConversation}</span>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
