import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getProduct, updateProduct, changeProductStatus } from '@/features/products/product.service';
import { ProductStatus } from '@prisma/client';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.businessId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const product = await getProduct(session.user.id, session.user.businessId, id);
    return NextResponse.json(product);
  } catch (e: unknown) {
    const error = e as { statusCode?: number; status?: number; message?: string };
    const status = error.statusCode || error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.businessId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    let product;
    if (body.status && Object.keys(body).length === 1) {
      product = await changeProductStatus(session.user.id, session.user.businessId, id, body.status);
    } else {
      if (body.status) {
        await changeProductStatus(session.user.id, session.user.businessId, id, body.status);
        delete body.status;
      }
      product = await updateProduct(session.user.id, session.user.businessId, id, body);
    }
    return NextResponse.json(product, { status: 200 });
  } catch (e: unknown) {
    const error = e as { statusCode?: number; status?: number; message?: string };
    const status = error.statusCode || error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.businessId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const product = await changeProductStatus(
      session.user.id,
      session.user.businessId,
      id,
      ProductStatus.ARCHIVED,
    );
    return NextResponse.json(product, { status: 200 });
  } catch (e: unknown) {
    const error = e as { statusCode?: number; status?: number; message?: string };
    const status = error.statusCode || error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}
