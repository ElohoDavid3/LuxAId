import { NextResponse } from 'next/server';
import { auth } from '../../../../lib/auth';
import { updateUserProfile } from '../../../../features/auth/profile.service';

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const user = await updateUserProfile(session.user.id, body);
    return NextResponse.json({ ok: true, user }, { status: 200 });
  } catch (e: unknown) {
    const error = e as { statusCode?: number; status?: number; message?: string };
    const status = error.statusCode || error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}
