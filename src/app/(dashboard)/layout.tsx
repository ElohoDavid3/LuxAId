import { redirect } from 'next/navigation';
import { SessionProvider } from 'next-auth/react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { Topbar } from '@/components/Topbar/Topbar';
import styles from './layout.module.css';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  const membership = await prisma.businessMembership.findFirst({
    where: { userId: session.user.id, status: 'ACTIVE' },
    select: { business: { select: { name: true } } },
  });

  return (
    <SessionProvider>
      <div className={styles.shell}>
        <Sidebar
          userName={session.user.name ?? session.user.email ?? undefined}
          businessName={membership?.business.name}
        />
        <div className={styles.main}>
          <div className={styles.content}>
            <Topbar />
            <div className={styles.contentBox}>{children}</div>
          </div>
        </div>
      </div>
    </SessionProvider>
  );
}
