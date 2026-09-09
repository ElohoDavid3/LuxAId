'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button/Button';

// PAID and REFUNDED are intentionally excluded: they can only be reached
// through server-side payment-provider verification, never by manual update.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['AWAITING_PAYMENT'],
  AWAITING_PAYMENT: ['CANCELLED'],
  PAID: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['READY_FOR_DELIVERY', 'CANCELLED'],
  READY_FOR_DELIVERY: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['RETURNED'],
};

export function OrderStatusUpdater({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleUpdate() {
    if (status === currentStatus || loading) return;
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update order status');
      }

      setSuccess(true);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating status');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {error && (
        <div style={{ color: 'var(--color-error, #dc2626)', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ color: '#166534', fontSize: '0.875rem' }}>
          Status updated successfully!
        </div>
      )}
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        disabled={loading}
        style={{
          width: '100%',
          padding: '0.625rem',
          borderRadius: '6px',
          border: '1px solid var(--color-outline-variant)',
          background: 'var(--color-surface)',
          fontSize: 'var(--type-dr-body-medium-font-size)',
        }}
      >
        {ALLOWED_TRANSITIONS[currentStatus]?.length ? (
          ALLOWED_TRANSITIONS[currentStatus].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))
        ) : (
          <option value={currentStatus} disabled>
            No manual transitions available
          </option>
        )}
      </select>
      <Button
        variant="primary"
        style={{ width: '100%' }}
        onClick={handleUpdate}
        disabled={loading || status === currentStatus}
      >
        {loading ? 'Updating...' : 'Update status'}
      </Button>
    </div>
  );
}
