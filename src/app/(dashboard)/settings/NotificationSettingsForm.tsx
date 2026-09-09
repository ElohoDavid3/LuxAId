'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button/Button';

export function NotificationSettingsForm({
  initialConfig,
}: {
  initialConfig: Record<string, unknown>;
}) {
  const router = useRouter();
  const [emailOnEscalation, setEmailOnEscalation] = useState(
    Boolean(initialConfig.emailOnEscalation ?? true),
  );
  const [emailOnNewOrder, setEmailOnNewOrder] = useState(
    Boolean(initialConfig.emailOnNewOrder ?? true),
  );
  const [emailOnPaymentFailed, setEmailOnPaymentFailed] = useState(
    Boolean(initialConfig.emailOnPaymentFailed ?? true),
  );

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setIsError(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationConfig: {
            emailOnEscalation,
            emailOnNewOrder,
            emailOnPaymentFailed,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Failed to update notification settings');
      }

      setMessage('Notification settings updated successfully!');
      router.refresh();
    } catch (err: unknown) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : 'Error updating settings');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {message && (
        <div style={{ fontSize: '0.875rem', color: isError ? 'var(--color-error)' : '#166534' }}>
          {message}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Escalation Alerts</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            Send email notifications when an AI conversation is escalated to human support.
          </div>
        </div>
        <input
          type="checkbox"
          checked={emailOnEscalation}
          onChange={(e) => setEmailOnEscalation(e.target.checked)}
          style={{ width: '18px', height: '18px' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>New Order Notifications</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            Send email alerts whenever a customer completes a new order.
          </div>
        </div>
        <input
          type="checkbox"
          checked={emailOnNewOrder}
          onChange={(e) => setEmailOnNewOrder(e.target.checked)}
          style={{ width: '18px', height: '18px' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Payment Failure Alerts</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            Notify me immediately when a customer payment attempt fails.
          </div>
        </div>
        <input
          type="checkbox"
          checked={emailOnPaymentFailed}
          onChange={(e) => setEmailOnPaymentFailed(e.target.checked)}
          style={{ width: '18px', height: '18px' }}
        />
      </div>

      <div style={{ marginTop: '0.5rem' }}>
        <Button variant="primary" type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save Notification Preferences'}
        </Button>
      </div>
    </form>
  );
}
