import { NextResponse } from 'next/server';
import { auth } from '../../../lib/auth';
import { updateBusinessSettings } from '../../../features/settings/settings.service';

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const businessId = (session.user as { businessId?: string }).businessId;
  if (!businessId) {
    return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  const notificationConfig =
    (body as { notificationConfig?: unknown })?.notificationConfig;
  if (
    notificationConfig === undefined ||
    typeof notificationConfig !== 'object' ||
    notificationConfig === null ||
    Array.isArray(notificationConfig)
  ) {
    return NextResponse.json(
      { error: 'notificationConfig must be an object.' },
      { status: 400 },
    );
  }

  try {
    const settings = await updateBusinessSettings(
      session.user.id,
      businessId,
      { notificationConfig: notificationConfig as Record<string, unknown> },
    );
    return NextResponse.json(settings);
  } catch (e: unknown) {
    const error = e as { statusCode?: number; status?: number; message?: string };
    const status = error.statusCode || error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}