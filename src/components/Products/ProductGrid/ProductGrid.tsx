'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ProductCard,
  type ProductTag,
} from '@/components/ProductCard/ProductCard';
import { ProductPhotoManager } from './ProductPhotoManager';
import styles from './ProductGrid.module.css';

export interface EditableProduct {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  price: number;
  priceLabel: string;
  tags: ProductTag[];
}

export function ProductGrid({ products }: { products: EditableProduct[] }) {
  const router = useRouter();
  const [busyProductId, setBusyProductId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingImageUrl, setEditingImageUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nairaPrice, setNairaPrice] = useState('');
  const [category, setCategory] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  async function saveImageUrl(productId: string, imageUrl: string | null) {
    setBusyProductId(productId);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? 'Could not save the photo.');
      }
      router.refresh();
    } finally {
      setBusyProductId(null);
    }
  }

  function startEditing(product: EditableProduct) {
    setEditingId(product.id);
    setEditingImageUrl(product.imageUrl ?? null);
    setName(product.name);
    setDescription(product.description ?? '');
    setNairaPrice((product.price / 100).toString());
    setCategory(product.category ?? '');
    setFormError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setFormError(null);
  }

  async function handleSaveDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingId) return;
    setFormError(null);

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const trimmedCategory = category.trim();
    const price = Number(nairaPrice);

    if (!trimmedName || !trimmedDescription || !nairaPrice.trim()) {
      setFormError('Please fill in the name, description, and price.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setFormError('Please enter a valid price.');
      return;
    }

    setIsSavingDetails(true);
    try {
      const res = await fetch(`/api/products/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          description: trimmedDescription,
          price: Math.round(price * 100),
          ...(trimmedCategory ? { category: trimmedCategory } : { category: null }),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setFormError(data?.error ?? 'Could not save your changes. Please try again.');
        return;
      }
      cancelEditing();
      router.refresh();
    } catch {
      setFormError('Something went wrong. Please try again.');
    } finally {
      setIsSavingDetails(false);
    }
  }

  if (editingId) {
    return (
      <form className={styles.editForm} onSubmit={handleSaveDetails} noValidate>
        {formError && (
          <p role="alert" className={styles.errorBox}>
            {formError}
          </p>
        )}

        <div className={styles.field}>
          <label htmlFor="edit-product-name" className={styles.label}>
            Product name
          </label>
          <input
            id="edit-product-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className={styles.input}
            disabled={isSavingDetails}
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="edit-product-description" className={styles.label}>
            Description
          </label>
          <textarea
            id="edit-product-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={styles.textarea}
            disabled={isSavingDetails}
          />
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label htmlFor="edit-product-price" className={styles.label}>
              Price (₦)
            </label>
            <input
              id="edit-product-price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={nairaPrice}
              onChange={(e) => setNairaPrice(e.target.value)}
              className={styles.input}
              disabled={isSavingDetails}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="edit-product-category" className={styles.label}>
              Category (optional)
            </label>
            <input
              id="edit-product-category"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={50}
              placeholder="e.g. Gowns"
              className={styles.input}
              disabled={isSavingDetails}
            />
          </div>
        </div>

        <ProductPhotoManager
          productName={name}
          currentImageUrl={editingImageUrl}
          isSaving={busyProductId === editingId}
          onSave={async (url) => {
            await saveImageUrl(editingId!, url);
            setEditingImageUrl(url);
          }}
        />

        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={isSavingDetails}
          >
            {isSavingDetails ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={cancelEditing}
            disabled={isSavingDetails}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={styles.grid}>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          name={product.name}
          description={product.description}
          imageUrl={product.imageUrl}
          category={product.category}
          priceLabel={product.priceLabel}
          tags={product.tags}
          topRightAction={
            <button
              type="button"
              className={styles.editButton}
              onClick={() => startEditing(product)}
              aria-label={`Edit ${product.name}`}
              data-testid={`edit-product-button-${product.id}`}
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.829-2.828Z" />
              </svg>
            </button>
          }
        />
      ))}
    </div>
  );
}
