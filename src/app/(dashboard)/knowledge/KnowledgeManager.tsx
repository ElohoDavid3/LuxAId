'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button/Button';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';

interface KnowledgeItem {
  id: string;
  content: string;
  status: string;
  stale: boolean;
  lastVerifiedAt: string | null;
  createdAt: string;
}

export function KnowledgeManager({ initialItems }: { initialItems: KnowledgeItem[] }) {
  const router = useRouter();
  const [newContent, setNewContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create entry');
      }

      setNewContent('');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error creating entry');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStale(id: string, currentStale: boolean) {
    try {
      const res = await fetch(`/api/knowledge/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stale: !currentStale }),
      });
      if (res.ok) router.refresh();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this knowledge source?')) return;
    try {
      const res = await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Create Form */}
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Add Verified Business Knowledge</h3>
        {error && (
          <div style={{ color: 'var(--color-error, #dc2626)', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="e.g. Orders placed before 12pm are dispatched same day. Delivery fee is ₦2,500."
          rows={3}
          required
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '6px',
            border: '1px solid var(--color-outline-variant)',
            background: 'var(--color-surface)',
            color: 'var(--color-on-surface)',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" type="submit" disabled={loading || !newContent.trim()}>
            {loading ? 'Adding...' : 'Add Knowledge Source'}
          </Button>
        </div>
      </form>

      {/* Knowledge Source List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Verified Knowledge Base ({initialItems.length})</h3>
        {initialItems.length === 0 ? (
          <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
            No knowledge entries added yet. Add policies, FAQs, or delivery info above so your AI assistant knows accurate business facts.
          </p>
        ) : (
          initialItems.map((item) => (
            <div
              key={item.id}
              style={{
                padding: '1rem',
                border: '1px solid var(--color-outline-variant)',
                borderRadius: '8px',
                background: item.stale ? 'var(--color-surface-container-low)' : 'var(--color-surface)',
                opacity: item.stale ? 0.75 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <StatusBadge status={item.status} />
                  {item.stale && <StatusBadge status="STALE" label="Stale" showDot />}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button
                    variant="ghost"
                    onClick={() => handleToggleStale(item.id, item.stale)}
                    style={{ fontSize: '0.75rem' }}
                  >
                    {item.stale ? 'Mark Verified' : 'Mark Stale'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => handleDelete(item.id)}
                    style={{ color: 'var(--color-error, #dc2626)', fontSize: '0.75rem' }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              <p style={{ fontSize: '0.9375rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{item.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
