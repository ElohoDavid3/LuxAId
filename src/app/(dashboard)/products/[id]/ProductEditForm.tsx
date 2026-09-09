'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button/Button';

interface ProductData {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string | null;
  status: string;
}

export function ProductEditForm({ product }: { product: ProductData }) {
  const router = useRouter();
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description || '');
  const [price, setPrice] = useState((product.price / 100).toString());
  const [category, setCategory] = useState(product.category || '');
  const [status, setStatus] = useState(product.status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const koboPrice = Math.round(parseFloat(price) * 100);
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          price: koboPrice,
          category: category.trim() || null,
          status,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update product');
      }

      setSuccess(true);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating product');
    } finally {
      setLoading(false);
    }
  }

  async function handleArchive() {
    if (!confirm('Are you sure you want to archive this product?')) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to archive product');
      }

      router.push('/products');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error archiving product');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--color-error-container, #fee2e2)', color: 'var(--color-error, #991b1b)', borderRadius: '6px' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '0.75rem 1rem', background: '#dcfce7', color: '#166534', borderRadius: '6px' }}>
          Product saved successfully!
        </div>
      )}

      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.375rem' }}>Product Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '6px', border: '1px solid var(--color-outline-variant)' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.375rem' }}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '6px', border: '1px solid var(--color-outline-variant)' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.375rem' }}>Price (₦)</label>
          <input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '6px', border: '1px solid var(--color-outline-variant)' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.375rem' }}>Category</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Shoes, Apparel"
            style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '6px', border: '1px solid var(--color-outline-variant)' }}
          />
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.375rem' }}>Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '6px', border: '1px solid var(--color-outline-variant)', background: 'var(--color-surface)' }}
        >
          <option value="DRAFT">DRAFT</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="ARCHIVED">ARCHIVED</option>
        </select>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
        <Button variant="primary" type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
        {status !== 'ARCHIVED' && (
          <Button variant="ghost" type="button" onClick={handleArchive} disabled={loading} style={{ color: 'var(--color-error, #dc2626)' }}>
            Archive Product
          </Button>
        )}
      </div>
    </form>
  );
}
