import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/session';
import { Card } from '@/components/Card/Card';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { EmptyState } from '@/components/EmptyState/EmptyState';
import styles from './orders.module.css';

export const metadata: Metadata = { title: 'Orders' };

async function getOrders(businessId: string, filter?: string) {
  const where: Record<string, unknown> = { businessId };
  if (filter && filter !== 'All') {
    where.status = filter;
  }

  const orders = await prisma.order.findMany({
    where,
    take: 50,
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

function formatNaira(kobo: number) {
  return '\u20A6' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_FILTERS = ['All', 'DRAFT', 'AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await requireDashboardSession();
  const { filter } = await searchParams;
  const orders = await getOrders(session.businessId, filter);

  return (
    <div>
      <div style={{ padding: '1.5rem 2rem' }}>
        {/* Filter tabs */}
        <div className={styles.filterTabs} role="tablist" aria-label="Order status filter">
          {STATUS_FILTERS.map((s) => (
            <Link
              key={s}
              href={s === 'All' ? '/orders' : `/orders?filter=${s}`}
              role="tab"
              aria-selected={(!filter && s === 'All') || filter === s}
              className={`${styles.filterTab} ${(!filter && s === 'All') || filter === s ? styles.active : ''}`}
            >
              {s === 'AWAITING_PAYMENT' ? 'Awaiting payment' : s.charAt(0) + s.slice(1).toLowerCase()}
            </Link>
          ))}
        </div>

        {/* Table */}
        <Card shadow>
          {orders.length === 0 ? (
            <EmptyState
              heading="No orders"
              body={filter && filter !== 'All' ? `No orders with status "${filter}".` : 'Orders from your customers will appear here.'}
              icon={
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M6 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.414A2 2 0 0 0 15.414 6L12 2.586A2 2 0 0 0 10.586 2H6Zm2 10a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H8Zm0-3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H8Z" clipRule="evenodd" />
                </svg>
              }
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--color-surface-container-low)' }}>
                  <tr>
                    {['Order', 'Customer', 'Date', 'Status', 'Amount', ''].map((h) => (
                      <th
                        key={h}
                        style={{ padding: '0.625rem 1.25rem', textAlign: h === 'Amount' ? 'right' : 'left', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--type-dr-label-medium-font-family)', fontSize: 'var(--type-dr-label-medium-font-size)', borderBottom: '1px solid var(--color-outline-variant)', whiteSpace: 'nowrap' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
                      <td style={{ padding: '0.75rem 1.25rem', fontWeight: 600 }}>#{order.reference}</td>
                      <td style={{ padding: '0.75rem 1.25rem' }}>{order.customerName}</td>
                      <td style={{ padding: '0.75rem 1.25rem', color: 'var(--color-on-surface-variant)', fontSize: 'var(--type-dr-body-small-font-size)' }}>{formatDate(order.createdAt)}</td>
                      <td style={{ padding: '0.75rem 1.25rem' }}><StatusBadge status={order.status} /></td>
                      <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right', fontWeight: 600 }}>{formatNaira(order.totalAmount)}</td>
                      <td style={{ padding: '0.75rem 1.25rem' }}>
                        <Link href={`/orders/${order.id}`} style={{ color: 'var(--color-primary)', fontFamily: 'var(--type-dr-label-large-font-family)', fontSize: 'var(--type-dr-label-large-font-size)', fontWeight: 600 }}>
                          View \u2192
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
