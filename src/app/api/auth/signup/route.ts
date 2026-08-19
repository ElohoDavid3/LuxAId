import { NextResponse } from 'next/server';
import { signup } from '../../../../features/auth/signup.service';
import { logger } from '../../../../lib/logger';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await signup(body);

    logger.info('auth.signup', { userId: result.userId, email: result.email });

    return NextResponse.json(
      { ok: true, user: { id: result.userId, name: result.name, email: result.email } },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Signup failed. Please try again.';

    logger.warn('auth.signup_failed', { message });

    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
