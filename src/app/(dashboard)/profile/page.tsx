import type { Metadata } from 'next';
import { requireDashboardSession } from '@/lib/session';
import { Card } from '@/components/Card/Card';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import { EditProfileSection } from '@/components/Profile/EditProfileSection/EditProfileSection';
import { ChangePasswordSection } from '@/components/Profile/ChangePasswordSection/ChangePasswordSection';
import styles from './page.module.css';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const session = await requireDashboardSession();

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: '640px' }}>
      {/* Account */}
      <Card shadow padded style={{ marginBottom: '1.25rem' }}>
        <EditProfileSection
          userName={session.userName}
          userEmail={session.userEmail}
        />
      </Card>

      {/* Password */}
      <Card shadow padded style={{ marginBottom: '1.25rem' }}>
        <ChangePasswordSection />
      </Card>

      {/* Personal preferences */}
      <Card shadow padded>
        <h2 className={styles.sectionTitle}>Personal preferences</h2>
        <div className={styles.prefRow}>
          <div>
            <div className={styles.prefName}>Day / night mode</div>
            <p className={styles.prefDesc}>
              Choose how OrderAId looks on your device.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </Card>
    </div>
  );
}
