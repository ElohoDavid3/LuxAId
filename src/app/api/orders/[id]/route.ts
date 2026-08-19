import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { updateStatus } from '@/features/orders/order.service';
import { UpdateStatusSchema } from '@/features/orders/validation';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { id } = await params;
  const businessId = session.user.businessId;
  if (!businessId) {
    return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
  }

  const body = await req.json();
  const parseResult = UpdateStatusSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parseResult.error.format() },
      { status: 400 },
    );
  }

  try {
    const order = await updateStatus(
      session.user.id,
      businessId,
      id,
      parseResult.data.status,
    );
    return NextResponse.json(order);
  } catch (e: unknown) {
    const error = e as { statusCode?: number; status?: number; message?: string };
    const status = error.statusCode || error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}
