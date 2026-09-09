import { NextResponse } from 'next/server';
import { auth } from '../../../lib/auth';
import { createOrder, listOrders } from '../../../features/orders/order.service';
import { CreateOrderSchema } from '../../../features/orders/validation';

/** POST /api/orders – create a new order */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const body = await req.json();
  const parseResult = CreateOrderSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parseResult.error.format() }, { status: 400 });
  }

  const businessId = (session.user as { businessId?: string }).businessId;
  if (!businessId) {
    return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
  }

  try {
    const order = await createOrder(session.user.id, businessId, parseResult.data);
    return NextResponse.json(order, { status: 201 });
  } catch (e: unknown) {
    const error = e as { statusCode?: number; status?: number; message?: string };
    const status = error.statusCode || error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}

/** GET /api/orders – list orders for the current business */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const businessId = (session.user as { businessId?: string }).businessId;
  if (!businessId) {
    return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
  }

  const skip = Number(searchParams.get('skip')) || 0;
  const take = Number(searchParams.get('take')) || 20;

  try {
    const orders = await listOrders(session.user.id, businessId, { skip, take });
    return NextResponse.json(orders);
  } catch (e: unknown) {
    const error = e as { statusCode?: number; status?: number; message?: string };
    const status = error.statusCode || error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}
