import { NextResponse } from 'next/server';
import { auth } from '../../../../lib/auth';
import { updateProduct } from '../../../../features/products/product.service';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const businessId = (session.user as { businessId?: string }).businessId;
  if (!businessId) {
    return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const product = await updateProduct(session.user.id, businessId, id, body);
    return NextResponse.json(product, { status: 200 });
  } catch (e: unknown) {
    const error = e as { statusCode?: number; status?: number; message?: string };
    const status = error.statusCode || error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}
