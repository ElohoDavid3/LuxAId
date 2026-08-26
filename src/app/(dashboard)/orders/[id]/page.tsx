import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/session';
import { Card } from '@/components/Card/Card';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { Button } from '@/components/Button/Button';
import styles from '../orders.module.css';

export const metadata: Metadata = { title: 'Order detail' };

function formatNaira(kobo: number) {
  return '\u20A6' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 });
}

function formatDate(iso: Date | string) {
  return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireDashboardSession();
  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: { id, businessId: session.businessId },
    include: {
      customer: { select: { name: true, phone: true, email: true } },
      items: {
        include: {
          product: { select: { name: true } },
          productVariant: { select: { name: true } },
        },
      },
      paymentAttempts: true,
      delivery: true,
    },
  });

  if (!order) notFound();

  return (
    <div>
      <div style={{ padding: '1.5rem 2rem' }}>
        <div className={styles.detailGrid}>
          {/* Left: items + payments */}
          <div>
            {/* Items */}
            <Card shadow style={{ marginBottom: '1.25rem' }}>
              <Card.Header>
                <Card.Title>Items</Card.Title>
                <StatusBadge status={order.status} />
              </Card.Header>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--color-surface-container-low)' }}>
                    <tr>
                      {['Product', 'Qty', 'Unit price', 'Total'].map((h) => (
                        <th key={h} style={{ padding: '0.5rem 1.25rem', textAlign: h === 'Qty' || h === 'Unit price' || h === 'Total' ? 'right' : 'left', color: 'var(--color-on-surface-variant)', fontSize: 'var(--type-dr-label-medium-font-size)', borderBottom: '1px solid var(--color-outline-variant)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
                        <td style={{ padding: '0.75rem 1.25rem' }}>
                          {item.product.name}
                          {item.productVariant && <span style={{ color: 'var(--color-on-surface-variant)' }}> / {item.productVariant.name}</span>}
                        </td>
                        <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>{item.quantity}</td>
                        <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>{formatNaira(item.unitPrice)}</td>
                        <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right', fontWeight: 600 }}>{formatNaira(item.quantity * item.unitPrice)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3} style={{ padding: '0.875rem 1.25rem', textAlign: 'right', fontWeight: 600, fontFamily: 'var(--type-dr-title-small-font-family)' }}>Order total</td>
                      <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'var(--type-dr-title-medium-font-family)', fontSize: 'var(--type-dr-title-medium-font-size)' }}>{formatNaira(order.totalAmount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Payment attempts */}
            <Card shadow>
              <Card.Header><Card.Title>Payment attempts</Card.Title></Card.Header>
              {order.paymentAttempts.length === 0 ? (
                <Card.Body>
                  <p style={{ color: 'var(--color-on-surface-variant)', fontSize: 'var(--type-dr-body-medium-font-size)' }}>No payment attempts yet.</p>
                </Card.Body>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--color-surface-container-low)' }}>
                      <tr>
                        {['Date', 'Status', 'Amount'].map((h) => (
                          <th key={h} style={{ padding: '0.5rem 1.25rem', textAlign: h === 'Amount' ? 'right' : 'left', color: 'var(--color-on-surface-variant)', fontSize: 'var(--type-dr-label-medium-font-size)', borderBottom: '1px solid var(--color-outline-variant)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {order.paymentAttempts.map((attempt) => (
                        <tr key={attempt.id} style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
                          <td style={{ padding: '0.75rem 1.25rem', color: 'var(--color-on-surface-variant)', fontSize: 'var(--type-dr-body-small-font-size)' }}>{formatDate(attempt.createdAt)}</td>
                          <td style={{ padding: '0.75rem 1.25rem' }}><StatusBadge status={attempt.status} /></td>
                          <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right', fontWeight: 600 }}>{formatNaira(attempt.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* Right: customer + delivery + actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Customer */}
            <Card shadow padded>
              <div className={styles.detailSection}>
                <div className={styles.detailLabel}>Customer</div>
                <div className={styles.detailValue}>{order.customer.name}</div>
              </div>
              {order.customer.phone && (
                <div className={styles.detailSection}>
                  <div className={styles.detailLabel}>Phone</div>
                  <div className={styles.detailValue}>{order.customer.phone}</div>
                </div>
              )}
              {order.customer.email && (
                <div className={styles.detailSection}>
                  <div className={styles.detailLabel}>Email</div>
                  <div className={styles.detailValue}>{order.customer.email}</div>
                </div>
              )}
              <div className={styles.detailSection}>
                <div className={styles.detailLabel}>Ordered on</div>
                <div className={styles.detailValue}>{formatDate(order.createdAt)}</div>
              </div>
            </Card>

            {/* Delivery */}
            {order.delivery && (
              <Card shadow padded>
                <div className={styles.detailLabel}>Delivery</div>
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <StatusBadge status={order.delivery.status} />
                  {order.delivery.carrier && (
                    <div style={{ fontSize: 'var(--type-dr-body-small-font-size)', color: 'var(--color-on-surface-variant)' }}>Carrier: {order.delivery.carrier}</div>
                  )}
                  {order.delivery.tracking && (
                    <div style={{ fontSize: 'var(--type-dr-label-medium-font-size)', color: 'var(--color-on-surface)' }}>Tracking: <strong>{order.delivery.tracking}</strong></div>
                  )}
                </div>
              </Card>
            )}

            {/* Actions */}
            <Card shadow padded>
              <div className={styles.detailLabel} style={{ marginBottom: '0.75rem' }}>Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                <Button variant="primary" style={{ width: '100%' }} disabled>
                  Update status
                </Button>
                <Link href={`/conversations?orderId=${order.id}`}>
                  <Button variant="ghost" style={{ width: '100%' }}>
                    View conversations
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
