import { NextResponse } from 'next/server';
import { auth } from '../../../../lib/auth';
import {
  createDeliveryZone,
  listDeliveryZones,
} from '../../../../features/delivery/delivery-zone.service';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const businessId = (session.user as { businessId?: string }).businessId;
  if (!businessId) {
    return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
  }

  try {
    const zones = await listDeliveryZones(session.user.id, businessId);
    return NextResponse.json(zones);
  } catch (e: unknown) {
    const error = e as { statusCode?: number; status?: number; message?: string };
    const status = error.statusCode || error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const businessId = (session.user as { businessId?: string }).businessId;
  if (!businessId) {
    return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const zone = await createDeliveryZone(session.user.id, businessId, body);
    return NextResponse.json(zone, { status: 201 });
  } catch (e: unknown) {
    const error = e as { statusCode?: number; status?: number; message?: string };
    const status = error.statusCode || error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}
