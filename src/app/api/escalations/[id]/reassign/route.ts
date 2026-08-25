import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { reassignEscalation } from '@/features/escalations/escalation.service';
import { AppError } from '@/lib/errors';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const businessId = session.user.businessId;
  if (!businessId) {
    return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
  }

  const { id } = await params;

  try {
    const result = await reassignEscalation(
      session.user.id,
      businessId,
      id,
    );
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
