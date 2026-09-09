import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/session';
import { Card } from '@/components/Card/Card';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';

export const metadata: Metadata = { title: 'Customer Detail' };

function formatNaira(kobo: number) {
  return '\u20A6' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 });
}

function formatDate(iso: Date | string) {
  return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireDashboardSession();
  const { id } = await params;

  const customer = await prisma.customer.findFirst({
    where: { id, businessId: session.businessId },
    include: {
      channelIdentities: true,
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      conversations: {
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { body: true },
          },
        },
      },
    },
  });

  if (!customer) notFound();

  const totalSpent = customer.orders
    .filter((o) => o.status === 'PAID')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/customers" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>
          &larr; Back to Customers
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
        {/* Left Column: Customer Profile Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <Card shadow padded>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
              {customer.name}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9375rem' }}>
              <div>
                <span style={{ color: 'var(--color-on-surface-variant)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Phone
                </span>
                <strong>{customer.phone || 'N/A'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-on-surface-variant)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Email
                </span>
                <strong>{customer.email || 'N/A'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-on-surface-variant)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Location
                </span>
                <strong>{customer.location || 'N/A'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-on-surface-variant)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Total Verified Spend
                </span>
                <strong style={{ color: 'var(--color-primary)', fontSize: '1.125rem' }}>
                  {formatNaira(totalSpent)}
                </strong>
              </div>
            </div>
          </Card>

          {/* Channel Identities */}
          <Card shadow padded>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Channel Identities
            </h3>
            {customer.channelIdentities.length === 0 ? (
              <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>No channel identities linked.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {customer.channelIdentities.map((ch) => (
                  <div key={ch.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', padding: '0.5rem', background: 'var(--color-surface-container-low)', borderRadius: '6px' }}>
                    <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{ch.channel}</span>
                    <span>{ch.channelId}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Orders & Conversations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Orders List */}
          <Card shadow padded>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>
              Order History ({customer.orders.length})
            </h3>
            {customer.orders.length === 0 ? (
              <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>No orders placed yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-outline-variant)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.5rem' }}>Order</th>
                      <th style={{ padding: '0.5rem' }}>Date</th>
                      <th style={{ padding: '0.5rem' }}>Status</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer.orders.map((ord) => (
                      <tr key={ord.id} style={{ borderBottom: '1px solid var(--color-outline-variant)', fontSize: '0.875rem' }}>
                        <td style={{ padding: '0.625rem 0.5rem' }}>
                          <Link href={`/orders/${ord.id}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                            #{ord.id.slice(-6).toUpperCase()}
                          </Link>
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', color: 'var(--color-on-surface-variant)' }}>{formatDate(ord.createdAt)}</td>
                        <td style={{ padding: '0.625rem 0.5rem' }}><StatusBadge status={ord.status} /></td>
                        <td style={{ padding: '0.625rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>{formatNaira(ord.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Conversations */}
          <Card shadow padded>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>
              Conversations ({customer.conversations.length})
            </h3>
            {customer.conversations.length === 0 ? (
              <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>No conversations recorded.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {customer.conversations.map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/conversations/${conv.id}`}
                    style={{
                      padding: '0.75rem',
                      border: '1px solid var(--color-outline-variant)',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-on-surface)' }}>
                        {conv.messages[0]?.body || 'No messages yet'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>
                        Channel: {(conv.channel ?? 'internal').toUpperCase()} &middot; {formatDate(conv.updatedAt)}
                      </div>
                    </div>
                    <StatusBadge status={conv.controlState} />
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
