import type { Metadata } from 'next';
import Link from 'next/link';
import { requireDashboardSession } from '@/lib/session';
import { listEscalations } from '@/features/escalations/escalation.service';
import { Card } from '@/components/Card/Card';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { EmptyState } from '@/components/EmptyState/EmptyState';

export const metadata: Metadata = { title: 'Escalations' };

function formatDate(iso: Date | string) {
  return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function EscalationsPage() {
  const session = await requireDashboardSession();
  const escalations = await listEscalations(session.userId, session.businessId);

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <Card shadow>
        <Card.Header>
          <Card.Title>Human Escalations ({escalations.length})</Card.Title>
        </Card.Header>

        {escalations.length === 0 ? (
          <EmptyState
            heading="No pending escalations"
            body="When customers require human assistance or AI hands off a conversation, escalations will appear here."
            icon={
              <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.75v3.25a.75.75 0 0 0 1.5 0V9.75A.75.75 0 0 0 10.5 9H9Z" clipRule="evenodd" />
              </svg>
            }
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ background: 'var(--color-surface-container-low)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase' }}>
                <tr>
                  <th style={{ padding: '0.75rem 1.25rem' }}>Customer</th>
                  <th style={{ padding: '0.75rem 1.25rem' }}>Reason</th>
                  <th style={{ padding: '0.75rem 1.25rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1.25rem' }}>Assignee</th>
                  <th style={{ padding: '0.75rem 1.25rem' }}>Date</th>
                  <th style={{ padding: '0.75rem 1.25rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {escalations.map((esc) => (
                  <tr key={esc.id} style={{ borderBottom: '1px solid var(--color-outline-variant)', fontSize: '0.875rem' }}>
                    <td style={{ padding: '0.75rem 1.25rem', fontWeight: 600 }}>
                      {esc.conversation.customer.name}
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem', maxWidth: '300px' }}>
                      {esc.reason}
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem' }}>
                      <StatusBadge status={esc.status} />
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem', color: 'var(--color-on-surface-variant)' }}>
                      {esc.assignee?.name || 'Unassigned'}
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem', color: 'var(--color-on-surface-variant)', fontSize: '0.75rem' }}>
                      {formatDate(esc.createdAt)}
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem' }}>
                      <Link
                        href={`/conversations/${esc.conversationId}`}
                        style={{ color: 'var(--color-primary)', fontWeight: 600 }}
                      >
                        Open Chat &rarr;
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
  );
}
