import { NextResponse } from 'next/server';
import { auth } from '../../../../../lib/auth';
import { getTwoFactorStatus } from '../../../../../features/auth/two-factor.service';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  try {
    const status = await getTwoFactorStatus(session.user.id);
    return NextResponse.json(status);
  } catch (e: unknown) {
    const error = e as { status?: number; message?: string };
    const status = error.status || 500;
    return NextResponse.json(
      { error: error.message || 'Internal error' },
      { status },
    );
  }
}
