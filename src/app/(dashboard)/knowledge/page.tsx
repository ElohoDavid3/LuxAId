import type { Metadata } from 'next';
import { requireDashboardSession } from '@/lib/session';
import { listAllKnowledge } from '@/features/knowledge/knowledge.service';
import { Card } from '@/components/Card/Card';
import { KnowledgeManager } from './KnowledgeManager';

export const metadata: Metadata = { title: 'Knowledge Base' };

export default async function KnowledgePage() {
  const session = await requireDashboardSession();
  const rawItems = await listAllKnowledge(session.userId, session.businessId);

  const items = rawItems.map((item) => ({
    id: item.id,
    content: item.content,
    status: item.status,
    stale: item.stale,
    lastVerifiedAt: item.lastVerifiedAt ? item.lastVerifiedAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
  }));

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <Card shadow padded>
        <KnowledgeManager initialItems={items} />
      </Card>
    </div>
  );
}
