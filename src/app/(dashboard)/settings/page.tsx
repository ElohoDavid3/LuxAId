import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/session';
import { Topbar } from '@/components/Topbar/Topbar';
import { Card } from '@/components/Card/Card';
import { Button } from '@/components/Button/Button';

export const metadata: Metadata = { title: 'Settings' };

async function getBusinessSettings(businessId: string) {
  const settings = await prisma.businessSettings.findUnique({
    where: { businessId },
  });
  return settings;
}

export default async function SettingsPage() {
  const session = await requireDashboardSession();
  const settings = await getBusinessSettings(session.businessId);

  const policies = (settings?.policies as Record<string, unknown>) ?? {};
  const notificationConfig = (settings?.notificationConfig as Record<string, unknown>) ?? {};

  return (
    <div>
      <Topbar title="Settings" />
      <div style={{ padding: '1.5rem 2rem', maxWidth: '800px' }}>
        {/* Business info */}
        <Card shadow padded style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontFamily: 'var(--type-dr-title-medium-font-family)', fontSize: 'var(--type-dr-title-medium-font-size)', fontWeight: 600, color: 'var(--color-on-surface)', marginBottom: '1rem' }}>
            Business
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--type-dr-label-medium-font-family)', fontSize: 'var(--type-dr-label-medium-font-size)', color: 'var(--color-on-surface-variant)', marginBottom: '0.25rem' }}>
                Business name
              </label>
              <div style={{ padding: '0.625rem 0.875rem', borderRadius: 8, border: '1px solid var(--color-outline-variant)', backgroundColor: 'var(--color-surface-container-low)', fontSize: 'var(--type-dr-body-medium-font-size)' }}>
                {session.businessName}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--type-dr-label-medium-font-family)', fontSize: 'var(--type-dr-label-medium-font-size)', color: 'var(--color-on-surface-variant)', marginBottom: '0.25rem' }}>
                Your email
              </label>
              <div style={{ padding: '0.625rem 0.875rem', borderRadius: 8, border: '1px solid var(--color-outline-variant)', backgroundColor: 'var(--color-surface-container-low)', fontSize: 'var(--type-dr-body-medium-font-size)' }}>
                {session.userEmail}
              </div>
            </div>
          </div>
        </Card>

        {/* Policies */}
        <Card shadow padded style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontFamily: 'var(--type-dr-title-medium-font-family)', fontSize: 'var(--type-dr-title-medium-font-size)', fontWeight: 600, color: 'var(--color-on-surface)', marginBottom: '1rem' }}>
            Business Policies
          </h2>
          {Object.keys(policies).length === 0 ? (
            <p style={{ color: 'var(--color-on-surface-variant)', fontSize: 'var(--type-dr-body-medium-font-size)' }}>
              No policies configured yet. Policies help the AI provide accurate information about your business.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {Object.entries(policies).map(([key, value]) => (
                <div key={key}>
                  <div style={{ fontFamily: 'var(--type-dr-label-medium-font-family)', fontSize: 'var(--type-dr-label-medium-font-size)', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.125rem' }}>
                    {key.replace(/_/g, ' ')}
                  </div>
                  <div style={{ fontSize: 'var(--type-dr-body-medium-font-size)' }}>
                    {typeof value === 'string' ? value : JSON.stringify(value)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Notification config */}
        <Card shadow padded style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontFamily: 'var(--type-dr-title-medium-font-family)', fontSize: 'var(--type-dr-title-medium-font-size)', fontWeight: 600, color: 'var(--color-on-surface)', marginBottom: '1rem' }}>
            Notifications
          </h2>
          {Object.keys(notificationConfig).length === 0 ? (
            <p style={{ color: 'var(--color-on-surface-variant)', fontSize: 'var(--type-dr-body-medium-font-size)' }}>
              No notification settings configured.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {Object.entries(notificationConfig).map(([key, value]) => (
                <div key={key}>
                  <div style={{ fontFamily: 'var(--type-dr-label-medium-font-family)', fontSize: 'var(--type-dr-label-medium-font-size)', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.125rem' }}>
                    {key.replace(/_/g, ' ')}
                  </div>
                  <div style={{ fontSize: 'var(--type-dr-body-medium-font-size)' }}>
                    {typeof value === 'string' ? value : JSON.stringify(value)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Actions */}
        <Card shadow padded>
          <h2 style={{ fontFamily: 'var(--type-dr-title-medium-font-family)', fontSize: 'var(--type-dr-title-medium-font-size)', fontWeight: 600, color: 'var(--color-on-surface)', marginBottom: '1rem' }}>
            Actions
          </h2>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button variant="primary" disabled>
              Edit settings
            </Button>
          </div>
          <p style={{ marginTop: '0.75rem', color: 'var(--color-on-surface-variant)', fontSize: 'var(--type-dr-body-small-font-size)' }}>
            Full settings editing will be available in a future update.
          </p>
        </Card>
      </div>
    </div>
  );
}
