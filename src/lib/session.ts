import { redirect } from 'next/navigation';
import { auth } from './auth';

export interface DashboardSession {
  userId: string;
  businessId: string;
  businessName: string;
  userName: string;
  userEmail: string;
}

/**
 * Resolves the current authenticated user's session with business context.
 * Redirects to login if unauthenticated or if business membership is missing.
 */
export async function requireDashboardSession(): Promise<DashboardSession> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  if (!session.user.businessId) {
    redirect('/auth/login');
  }

  return {
    userId: session.user.id,
    businessId: session.user.businessId,
    businessName: session.user.businessName ?? 'My Business',
    userName: session.user.name ?? session.user.email ?? 'User',
    userEmail: session.user.email ?? '',
  };
}
