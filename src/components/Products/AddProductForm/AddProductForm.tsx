'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button/Button';
import styles from './AddProductForm.module.css';

const MAX_IMAGE_MB = 5;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function AddProductForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [variantName, setVariantName] = useState('');
  const [sku, setSku] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function handleSelectImage(file: File | undefined) {
    // Reset first so choosing the same file again re-fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = '';
    setError(null);
    if (!file || isUploadingImage) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError('Product images must be JPG, PNG or WebP.');
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError('Images must be 5MB or smaller. Please choose a smaller file.');
      return;
    }

    // Show a local preview immediately, then swap in the stored URL.
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setIsUploadingImage(true);
    const formData = new FormData();
    formData.append('file', file);

    fetch('/api/uploads/product-image', { method: 'POST', body: formData })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as
          | { url?: string; error?: string }
          | null;
        if (!res.ok || !data?.url) {
          setError(data?.error ?? 'Could not upload the image. Please try again.');
          setImagePreview((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
          return;
        }
        setImageUrl(data.url);
        setImagePreview((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      })
      .catch(() => {
        setError('Something went wrong while uploading the image. Please try again.');
        setImagePreview((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      })
      .finally(() => {
        setIsUploadingImage(false);
      });
  }

  function handleRemoveImage() {
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setImageUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

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

      <div className={styles.field}>
        <span className={styles.label} id="product-image-label">
          Product image
        </span>
        {imageUrl || imagePreview ? (
          <div className={styles.imagePreviewWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview ?? imageUrl}
              alt="Product preview"
              className={`${styles.imagePreview} ${isUploadingImage ? styles.imageUploading : ''}`}
            />
            <button
              type="button"
              className={styles.removeImageButton}
              onClick={handleRemoveImage}
              disabled={isSaving || isUploadingImage}
            >
              Remove
            </button>
            {isUploadingImage && (
              <span className={styles.hint} role="status">
                Uploading…
              </span>
            )}
          </div>
        ) : (
          <>
            <button
              type="button"
              className={styles.uploadButton}
              onClick={() => fileInputRef.current?.click()}
              disabled={isSaving || isUploadingImage}
              aria-describedby="product-image-label"
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <path d="M9.25 3a.75.75 0 0 1 1.5 0v6.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l1.72 1.72V3Z" />
                <path d="M4.5 9.75a.75.75 0 0 0-1.5 0v4A2.25 2.25 0 0 0 5.25 16h9.5a2.25 2.25 0 0 0 2.25-2.25v-4a.75.75 0 0 0-1.5 0v4a.75.75 0 0 1-.75.75h-9.5a.75.75 0 0 1-.75-.75v-4Z" />
              </svg>
              Choose from gallery
            </button>
            <span className={styles.hint}>JPG, PNG or WebP, up to 5MB.</span>
            {showUrlInput ? (
              <input
                type="url"
                name="imageUrl"
                placeholder="https://example.com/photo.jpg"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className={styles.input}
                disabled={isSaving}
                aria-label="Image URL"
              />
            ) : (
              <button
                type="button"
                className={styles.linkLikeButton}
                onClick={() => setShowUrlInput(true)}
              >
                Or paste an image link
              </button>
            )}
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => handleSelectImage(e.target.files?.[0])}
          hidden
        />
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
        <Button
          type="submit"
          variant="primary"
          isLoading={isSaving || isUploadingImage}
        >
          Save product
        </Button>
      </div>

      <p className={styles.note}>
        New products are saved as drafts. You can publish them when you are ready to sell.
      </p>
    </form>
  );
}
