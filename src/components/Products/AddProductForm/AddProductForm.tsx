'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button/Button';
import styles from './AddProductForm.module.css';

export function AddProductForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [variantName, setVariantName] = useState('');
  const [sku, setSku] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const trimmedImageUrl = imageUrl.trim();
    const trimmedCategory = category.trim();
    const trimmedSku = sku.trim();
    const nairaPrice = Number(price);

    if (!trimmedName || !trimmedDescription || !price.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    if (!Number.isFinite(nairaPrice) || nairaPrice < 0) {
      setError('Please enter a valid price.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          description: trimmedDescription,
          ...(trimmedImageUrl ? { imageUrl: trimmedImageUrl } : {}),
          ...(trimmedCategory ? { category: trimmedCategory } : {}),
          price: Math.round(nairaPrice * 100),
          variant: {
            ...(trimmedSku ? { sku: trimmedSku } : {}),
            ...(variantName.trim() ? { name: variantName.trim() } : {}),
          },
        }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;

      if (!res.ok) {
        setError(data?.error ?? 'Could not save the product. Please try again.');
        return;
      }

      router.push('/products');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && (
        <div role="alert" className={styles.errorBox}>
          {error}
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="product-name" className={styles.label}>
          Product name
        </label>
        <input
          id="product-name"
          type="text"
          name="name"
          required
          maxLength={200}
          placeholder="e.g. Ankara gown"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={styles.input}
          disabled={isSaving}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="product-description" className={styles.label}>
          Description
        </label>
        <textarea
          id="product-description"
          name="description"
          required
          rows={4}
          placeholder="Describe the product so customers know what they are buying."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={styles.textarea}
          disabled={isSaving}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="product-price" className={styles.label}>
          Price (₦)
        </label>
        <input
          id="product-price"
          type="number"
          name="price"
          required
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder="e.g. 7500"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={styles.input}
          disabled={isSaving}
        />
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.field}>
          <label htmlFor="product-image-url" className={styles.label}>
            Image URL (optional)
          </label>
          <input
            id="product-image-url"
            type="url"
            name="imageUrl"
            placeholder="https://example.com/photo.jpg"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className={styles.input}
            disabled={isSaving}
          />
          <span className={styles.hint}>Shown on the product card.</span>
        </div>

        <div className={styles.field}>
          <label htmlFor="product-category" className={styles.label}>
            Category (optional)
          </label>
          <input
            id="product-category"
            type="text"
            name="category"
            maxLength={50}
            placeholder="e.g. Fabrics, Food, Gadgets"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={styles.input}
            disabled={isSaving}
          />
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.field}>
          <label htmlFor="variant-sku" className={styles.label}>
            SKU (optional)
          </label>
          <input
            id="variant-sku"
            type="text"
            name="sku"
            placeholder="e.g. AG-BLUE-M"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className={styles.input}
            disabled={isSaving}
          />
          <span className={styles.hint}>
            Leave this blank and we will create a unique one for you.
          </span>
        </div>

        <div className={styles.field}>
          <label htmlFor="variant-name" className={styles.label}>
            Variant name (optional)
          </label>
          <input
            id="variant-name"
            type="text"
            name="variantName"
            placeholder="e.g. Blue / Medium"
            value={variantName}
            onChange={(e) => setVariantName(e.target.value)}
            className={styles.input}
            disabled={isSaving}
          />
          <span className={styles.hint}>Leave blank to use the product name.</span>
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" isLoading={isSaving}>
          Save product
        </Button>
      </div>

      <p className={styles.note}>
        New products are saved as drafts. You can publish them when you are ready to sell.
      </p>
    </form>
  );
}
