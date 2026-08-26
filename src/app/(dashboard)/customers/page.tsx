import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/session';
import { Card } from '@/components/Card/Card';
import { EmptyState } from '@/components/EmptyState/EmptyState';

export const metadata: Metadata = { title: 'Customers' };

async function getCustomers(businessId: string) {
  const customers = await prisma.customer.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { orders: true } },
      conversations: {
        take: 1,
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      },
    },
  });

  return customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    orderCount: c._count.orders,
    lastSeenAt: c.conversations[0]?.updatedAt?.toISOString() ?? c.createdAt.toISOString(),
  }));
}

function formatDate(iso?: string) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function CustomersPage() {
  const session = await requireDashboardSession();
  const customers = await getCustomers(session.businessId);

  return (
    <div>
      <div style={{ padding: '1.5rem 2rem' }}>
        <Card shadow>
          {customers.length === 0 ? (
            <EmptyState
              heading="No customers yet"
              body="Customers who contact your business will appear here."
              icon={
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM17 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 0 0-1.5-4.33A5 5 0 0 1 19 16v1h-6.07ZM6 11a5 5 0 0 1 5 5v1H1v-1a5 5 0 0 1 5-5Z" />
                </svg>
              }
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--color-surface-container-low)' }}>
                  <tr>
                    {['Name', 'Phone', 'Email', 'Orders', 'Last seen'].map((h) => (
                      <th key={h} style={{ padding: '0.625rem 1.25rem', textAlign: 'left', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--type-dr-label-medium-font-family)', fontSize: 'var(--type-dr-label-medium-font-size)', borderBottom: '1px solid var(--color-outline-variant)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--color-outline-variant)', transition: 'background 0.1s' }}>
                      <td style={{ padding: '0.75rem 1.25rem', fontWeight: 600 }}>
                        <Link href={`/customers/${c.id}`} style={{ color: 'var(--color-primary)' }}>{c.name}</Link>
                      </td>
                      <td style={{ padding: '0.75rem 1.25rem', color: 'var(--color-on-surface-variant)' }}>{c.phone ?? '\u2014'}</td>
                      <td style={{ padding: '0.75rem 1.25rem', color: 'var(--color-on-surface-variant)' }}>{c.email ?? '\u2014'}</td>
                      <td style={{ padding: '0.75rem 1.25rem' }}>{c.orderCount}</td>
                      <td style={{ padding: '0.75rem 1.25rem', color: 'var(--color-on-surface-variant)', fontSize: 'var(--type-dr-body-small-font-size)' }}>{formatDate(c.lastSeenAt)}</td>
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
