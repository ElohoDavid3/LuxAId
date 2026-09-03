import { NextResponse } from 'next/server';
import { auth } from '../../../../../lib/auth';
import {
  enableTwoFactor,
  verifyLoginCode,
  getTwoFactorStatus,
} from '../../../../../features/auth/two-factor.service';
import { logAudit } from '../../../../../features/auth/audit';
import { prisma } from '../../../../../lib/prisma';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { code, secret, purpose } = body as {
      code?: string;
      secret?: string;
      purpose?: string;
    };

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Verification code is required.' },
        { status: 400 },
      );
    }

    if (purpose === 'login') {
      const valid = await verifyLoginCode(session.user.id, code);
      if (!valid) {
        return NextResponse.json(
          { error: 'Invalid code. Please try again.' },
          { status: 400 },
        );
      }

      const membership = await prisma.businessMembership.findFirst({
        where: { userId: session.user.id, status: 'ACTIVE' },
        select: { businessId: true },
      });
      if (membership) {
        await logAudit({
          businessId: membership.businessId,
          eventType: 'auth.2fa_login_verified',
          actorId: session.user.id,
          actorType: 'USER',
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (!secret || typeof secret !== 'string') {
      return NextResponse.json(
        { error: 'Secret is required for setup.' },
        { status: 400 },
      );
    }

    const result = await enableTwoFactor(session.user.id, code, secret);

    const membership = await prisma.businessMembership.findFirst({
      where: { userId: session.user.id, status: 'ACTIVE' },
      select: { businessId: true },
    });
    if (membership) {
      await logAudit({
        businessId: membership.businessId,
        eventType: 'auth.2fa_enabled',
        actorId: session.user.id,
        actorType: 'USER',
      });
    }

    return NextResponse.json({ ok: true, backupCodes: result.codes });
  } catch (e: unknown) {
    const error = e as { status?: number; message?: string };
    const status = error.status || 500;
    return NextResponse.json(
      { error: error.message || 'Internal error' },
      { status },
    );
  }
}

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
