import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { initiatePayment } from '@/features/payments/payment.service';
import { InitiatePaymentInputSchema } from '@/features/payments/validation';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const businessId = session.user.businessId;
  if (!businessId) {
    return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
  }

  const body = await req.json();
  const parseResult = InitiatePaymentInputSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parseResult.error.format() },
      { status: 400 },
    );
  }

  try {
    const result = await initiatePayment(
      session.user.id,
      businessId,
      parseResult.data.orderId,
      { redirectUrl: parseResult.data.redirectUrl },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (e: unknown) {
    const error = e as { statusCode?: number; status?: number; message?: string };
    const status = error.statusCode || error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}
