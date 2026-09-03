import { NextResponse } from 'next/server';
import { auth } from '../../../../../lib/auth';
import { generateTwoFactorSecret } from '../../../../../features/auth/two-factor.service';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const email = session.user.email ?? 'user@orderaid.com';
  const setup = generateTwoFactorSecret(session.user.id, email);

  return NextResponse.json({
    otpauthUri: setup.otpauthUri,
    secret: setup.secret,
  });
}
