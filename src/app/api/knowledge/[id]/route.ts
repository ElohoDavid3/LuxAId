import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { updateKnowledgeSource, deleteKnowledgeSource } from '@/features/knowledge/knowledge.service';

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
    const item = await updateKnowledgeSource(session.user.id, session.user.businessId, id, body);
    return NextResponse.json(item);
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
    await deleteKnowledgeSource(session.user.id, session.user.businessId, id);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const error = e as { statusCode?: number; status?: number; message?: string };
    const status = error.statusCode || error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}
