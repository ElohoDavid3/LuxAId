'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button/Button';

export function ReplyForm({ conversationId }: { conversationId: string }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send message');
      }

      setText('');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error sending message');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
      {error && (
        <div style={{ color: 'var(--color-error)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your reply here..."
          disabled={loading}
          style={{
            flex: 1,
            padding: '0.625rem 0.875rem',
            borderRadius: 'var(--border-radius-medium, 6px)',
            border: '1px solid var(--color-outline-variant)',
            background: 'var(--color-surface)',
            color: 'var(--color-on-surface)',
            fontSize: 'var(--type-dr-body-medium-font-size)',
          }}
        />
        <Button variant="primary" type="submit" disabled={loading || !text.trim()}>
          {loading ? 'Sending...' : 'Send Reply'}
        </Button>
      </div>
    </form>
  );
}
