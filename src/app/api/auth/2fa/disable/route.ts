import { NextResponse } from 'next/server';
import { auth } from '../../../../../lib/auth';
import { disableTwoFactor } from '../../../../../features/auth/two-factor.service';
import { verifyPassword } from '../../../../../features/auth/password.service';
import { prisma } from '../../../../../lib/prisma';
import { logAudit } from '../../../../../features/auth/audit';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { code, currentPassword } = body as {
      code?: string;
      currentPassword?: string;
    };

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Verification code is required.' },
        { status: 400 },
      );
    }

    if (!currentPassword || typeof currentPassword !== 'string') {
      return NextResponse.json(
        { error: 'Current password is required to disable 2FA.' },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const passwordValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!passwordValid) {
      return NextResponse.json(
        { error: 'Your current password is incorrect.' },
        { status: 400 },
      );
    }

    await disableTwoFactor(session.user.id, code);

    const membership = await prisma.businessMembership.findFirst({
      where: { userId: session.user.id, status: 'ACTIVE' },
      select: { businessId: true },
    });
    if (membership) {
      await logAudit({
        businessId: membership.businessId,
        eventType: 'auth.2fa_disabled',
        actorId: session.user.id,
        actorType: 'USER',
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const error = e as { status?: number; message?: string };
    const status = error.status || 500;
    return NextResponse.json(
      { error: error.message || 'Internal error' },
      { status },
    );
  }
}
