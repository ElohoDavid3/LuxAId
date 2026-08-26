import { NextResponse } from 'next/server';
import { auth } from '../../../../lib/auth';
import { AppError } from '../../../../lib/errors';
import { uploadProductImage } from '../../../../features/products/image-upload';

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
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Please choose an image to upload.' },
        { status: 400 },
      );
    }

    const uploaded = await uploadProductImage(businessId, file);
    return NextResponse.json(uploaded, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
