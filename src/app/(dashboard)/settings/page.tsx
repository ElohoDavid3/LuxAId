import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/session';
import { Card } from '@/components/Card/Card';
import { ChannelConnection } from '@/components/Settings/ChannelConnection/ChannelConnection';
import { DeliverySettings, type DeliveryZoneView } from '@/components/Settings/DeliverySettings/DeliverySettings';
import {
  getWhatsAppConnection,
} from '@/features/settings/whatsapp-connection';
import {
  getInstagramConnection,
} from '@/features/settings/instagram-connection';
import { listDeliveryZones } from '@/features/delivery/delivery-zone.service';
import { TwoFactorAuth } from '@/components/Settings/TwoFactorAuth/TwoFactorAuth';
import styles from './page.module.css';

export const metadata: Metadata = { title: 'Settings' };

const OTHER_CHANNELS = [
  {
    id: 'website',
    name: 'Website',
    description: 'Embed the AI assistant directly into your website for instant support.',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
        <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Zm7.25-.75a.75.75 0 0 1 .75-.75h3.25a.75.75 0 0 1 .75.75v3.25a.75.75 0 0 1-1.5 0V6.31l-5.47 5.47a.75.75 0 1 1-1.06-1.06l5.47-5.47H12.25a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: 'facebook',
    name: 'Facebook',
    description: 'Connect your Facebook Page to handle messages and orders via Messenger.',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
        <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v8.5A2.25 2.25 0 0 1 15.75 15h-3.105a3.501 3.501 0 0 0 1.1 1.677A.75.75 0 0 1 13.26 18H6.74a.75.75 0 0 1-.484-1.323A3.501 3.501 0 0 0 7.355 15H4.25A2.25 2.25 0 0 1 2 12.75v-8.5Zm6.75 6.25a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
      </svg>
    ),
  },
];

async function getSettingsData(businessId: string, userId: string) {
  const [memberships, settings, connectedChannels, whatsappStatus, instagramStatus, zones, user] =
    await Promise.all([
      prisma.businessMembership.findMany({
        where: { businessId, status: 'ACTIVE' },
        select: {
          role: true,
          user: { select: { name: true, email: true } },
        },
      }),
      prisma.businessSettings.findUnique({ where: { businessId } }),
      prisma.customerChannelIdentity.findMany({
        where: { businessId },
        select: { channel: true },
        distinct: ['channel'],
      }),
      getWhatsAppConnection(businessId),
      getInstagramConnection(businessId),
      listDeliveryZones(userId, businessId),
      prisma.user.findUnique({
        where: { id: userId },
        select: { twoFactorEnabled: true },
      }),
    ]);

  const deliveryZones: DeliveryZoneView[] = zones.map((z) => ({
    id: z.id,
    name: z.name,
    fee: z.fee,
    coverage: Array.isArray(z.coverage)
      ? z.coverage.filter((a): a is string => typeof a === 'string')
      : [],
  }));

  return {
    memberships,
    settings,
    connectedChannels,
    whatsappStatus,
    instagramStatus,
    deliveryZones,
    twoFactorEnabled: user?.twoFactorEnabled ?? false,
  };
}

function formatRole(role: string) {
  return role.toLowerCase().replace(/_/g, ' ');
}

export default async function SettingsPage() {
  const session = await requireDashboardSession();
  const {
    memberships,
    settings,
    connectedChannels,
    whatsappStatus,
    instagramStatus,
    deliveryZones,
    twoFactorEnabled,
  } = await getSettingsData(session.businessId, session.userId);

  const notificationConfig = (settings?.notificationConfig as Record<string, unknown>) ?? {};
  const connectedSet = new Set(connectedChannels.map((c) => c.channel.toLowerCase()));

  return (
    <div>
      <div style={{ padding: '1.5rem 2rem', maxWidth: '800px' }}>
        {/* Business information */}
        <Card shadow padded style={{ marginBottom: '1.25rem' }}>
          <h2 className={styles.sectionTitle}>Business information</h2>
          <div className={styles.fieldGrid}>
            <div>
              <label className={styles.label}>Business name</label>
              <div className={styles.readOnly}>{session.businessName}</div>
            </div>
            <div>
              <label className={styles.label}>Your email</label>
              <div className={styles.readOnly}>{session.userEmail}</div>
            </div>
          </div>
        </Card>

        {/* Team members */}
        <Card shadow padded style={{ marginBottom: '1.25rem' }}>
          <h2 className={styles.sectionTitle}>Team members</h2>
          <p className={styles.sectionBody}>
            People who help run this business on OrderAId.
          </p>
          <div>
            {memberships.map((member) => {
              const memberInitials = member.user.name
                ? member.user.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
                : 'U';
              return (
                <div key={member.user.email} className={styles.memberRow}>
                  <div className={styles.memberAvatar} aria-hidden="true">
                    {memberInitials}
                  </div>
                  <div className={styles.memberInfo}>
                    <div className={styles.memberName}>{member.user.name}</div>
                    <div className={styles.memberEmail}>{member.user.email}</div>
                  </div>
                  <span className={styles.roleBadge}>{formatRole(member.role)}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Integrations (WhatsApp & other channels) */}
        <Card shadow padded style={{ marginBottom: '1.25rem' }}>
          <h2 className={styles.sectionTitle}>Integrations</h2>
          <p className={styles.sectionBody}>
            Connect platforms so OrderAId can handle customer conversations with AI.
          </p>
          <div className={styles.rowList}>
            <ChannelConnection
              endpoint="/api/settings/whatsapp"
              name="WhatsApp"
              description="Let customers message your WhatsApp and get AI-powered replies."
              initial={{
                connected: whatsappStatus.connected,
                displayLabel: whatsappStatus.displayPhoneNumber,
              }}
              idFieldName="phoneNumberId"
              idFieldLabel="Phone number ID"
              idFieldPlaceholder="From your Meta WhatsApp Business setup"
              optionalFieldName="businessAccountId"
              optionalFieldLabel="Business account ID (optional)"
              icon={
                <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
                  <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm.93 11.412a.75.75 0 0 1-1.06-.022l-2.5-2.43a.75.75 0 0 1 1.084-1.036l1.97 1.92 3.93-4.16a.75.75 0 1 1 1.12 1.004l-4.5 4.724Z" />
                </svg>
              }
            />
            <ChannelConnection
              endpoint="/api/settings/instagram"
              name="Instagram"
              description="Respond to Instagram DMs with AI and manage orders from chat."
              initial={{
                connected: instagramStatus.connected,
                displayLabel:
                  instagramStatus.username ? `@${instagramStatus.username}` : undefined,
              }}
              idFieldName="instagramAccountId"
              idFieldLabel="Instagram account ID"
              idFieldPlaceholder="Your Instagram Business account ID from Meta"
              icon={
                <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
                  <path fillRule="evenodd" d="M10 0C8.278 0 7.928.014 6.743.072 5.558.13 4.706.333 3.94.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.906.13 5.758.072 6.943.014 8.128 0 8.478 0 10s.014 1.872.072 3.057c.058 1.185.261 2.037.558 2.803.306.789.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.297 1.618.5 2.803.558C8.128 19.986 8.478 20 10 20s1.872-.014 3.057-.072c1.185-.058 2.037-.261 2.803-.558.789-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.336 1.384-2.126.297-.766.5-1.618.558-2.803.058-1.185.072-1.535.072-3.057s-.014-1.872-.072-3.057c-.058-1.185-.261-2.037-.558-2.803a5.733 5.733 0 0 0-1.384-2.126A5.733 5.733 0 0 0 16.06.63c-.766-.297-1.618-.5-2.803-.558C12.072.014 11.722 0 10 0Zm0 1.802c1.72 0 1.93.014 2.612.077.634.058 1.036.152 1.276.252.324.132.556.29.802.536.246.246.404.478.536.802.1.24.194.642.252 1.276.063.682.077.892.077 2.612s-.014 1.93-.077 2.612c-.058.634-.152 1.036-.252 1.276a2.16 2.16 0 0 1-.536.802 2.16 2.16 0 0 1-.802.536c-.24.1-.642.194-1.276.252-.682.063-.892.077-2.612.077s-1.93-.014-2.612-.077c-.634-.058-1.036-.152-1.276-.252a2.16 2.16 0 0 1-.802-.536 2.16 2.16 0 0 1-.536-.802c-.1-.24-.194-.642-.252-1.276-.063-.682-.077-.892-.077-2.612s.014-1.93.077-2.612c.058-.634.152-1.036.252-1.276.132-.324.29-.556.536-.802.246-.246.478-.404.802-.536.24-.1.642-.194 1.276-.252.682-.063.892-.077 2.612-.077Zm0 3.063a5.135 5.135 0 1 0 0 10.27 5.135 5.135 0 0 0 0-10.27Zm0 1.802a3.333 3.333 0 0 1 0 6.666 3.333 3.333 0 0 1 0-6.666Zm5.338-3.205a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 1 0 0-2.4Z" clipRule="evenodd" />
                </svg>
              }
            />
            {OTHER_CHANNELS.map((ch) => {
              const connected = connectedSet.has(ch.id);
              return (
                <div key={ch.id} className={styles.row}>
                  <div className={styles.rowIcon}>{ch.icon}</div>
                  <div className={styles.rowInfo}>
                    <div className={styles.rowName}>{ch.name}</div>
                    <div className={styles.rowDesc}>{ch.description}</div>
                  </div>
                  {connected ? (
                    <span className={styles.connectedBadge}>Connected</span>
                  ) : (
                    <span className={styles.notConnected}>Not connected</span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Delivery settings */}
        <Card shadow padded style={{ marginBottom: '1.25rem' }}>
          <DeliverySettings zones={deliveryZones} />
        </Card>

        {/* Notifications */}
        <Card shadow padded style={{ marginBottom: '1.25rem' }}>
          <h2 className={styles.sectionTitle}>Notifications</h2>
          {Object.keys(notificationConfig).length === 0 ? (
            <p className={styles.sectionBody}>
              No notification settings configured yet.
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

        {/* Security */}
        <Card shadow padded>
          <h2 className={styles.sectionTitle}>Security</h2>
          <div className={styles.rowList} style={{ marginTop: '0.5rem' }}>
            <TwoFactorAuth initialEnabled={twoFactorEnabled} />
            <div className={styles.row}>
              <div className={styles.rowInfo}>
                <div className={styles.rowName}>Sign out of all devices</div>
                <div className={styles.rowDesc}>
                  Sign this account out everywhere it is logged in.
                </div>
              </div>
              <span className={styles.soonBadge}>Coming soon</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
