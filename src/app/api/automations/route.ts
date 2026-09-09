import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { listAutomations, createAutomation, processAbandonedOrderRecovery } from '@/features/automations/automation.service';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.businessId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  try {
    const automations = await listAutomations(session.user.id, session.user.businessId);
    return NextResponse.json(automations);
  } catch (e: unknown) {
    const error = e as { statusCode?: number; status?: number; message?: string };
    const status = error.statusCode || error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.businessId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (body.action === 'run_abandoned_recovery') {
      const recoveredCount = await processAbandonedOrderRecovery(session.user.businessId);
      return NextResponse.json({ success: true, recoveredCount });
    }

    const automation = await createAutomation(session.user.id, session.user.businessId, body);
    return NextResponse.json(automation, { status: 201 });
  } catch (e: unknown) {
    const error = e as { statusCode?: number; status?: number; message?: string };
    const status = error.statusCode || error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}
