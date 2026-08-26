'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './ProductPhotoManager.module.css';

const MAX_PHOTO_MB = 5;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

type ProductPhotoManagerProps = {
  productName: string;
  currentImageUrl?: string | null;
  isSaving?: boolean;
  /** Persist the new photo URL, or null to remove the current one. */
  onSave: (imageUrl: string | null) => Promise<void>;
};

export function ProductPhotoManager({
  productName,
  currentImageUrl,
  isSaving = false,
  onSave,
}: ProductPhotoManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = isUploading || isSaving;

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) setIsOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, busy]);

  function clearSelection() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function close() {
    if (busy) return;
    clearSelection();
    setIsOpen(false);
  }

  async function handleSelectImage(file: File | undefined) {
    // Reset first so choosing the same file again re-fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file || busy) return;

    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setError('Photos must be JPG, PNG or WebP.');
      return;
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      setError(`Photos must be ${MAX_PHOTO_MB}MB or smaller.`);
      return;
    }

    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setError(null);

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/uploads/product-image', {
        method: 'POST',
        body: formData,
      });
      const data = (await res.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;

      if (!res.ok || !data?.url) {
        setError(data?.error ?? 'Could not upload the photo. Please try again.');
        return;
      }

      await onSave(data.url);

      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setIsOpen(false);
    } catch {
      setError('Something went wrong while saving. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemove() {
    if (busy || !currentImageUrl) return;
    setError(null);
    try {
      await onSave(null);
      clearSelection();
      setIsOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the photo.');
    }
  }

  const shownPhoto = previewUrl ?? currentImageUrl ?? TRANSPARENT_PIXEL;

  return (
    <>
      <button
        type="button"
        className={styles.triggerButton}
        onClick={() => setIsOpen(true)}
        data-testid="product-photo-button"
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          width="14"
          height="14"
          aria-hidden="true"
        >
          <path d="M6.5 3a1.5 1.5 0 0 0-1.29.737L4.423 5H3A2 2 0 0 0 1 7v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1.423l-.787-1.263A1.5 1.5 0 0 0 13.5 3h-7ZM10 14a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm0-1.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
        </svg>
        {currentImageUrl ? 'Change photo' : 'Add photo'}
      </button>

      {isOpen && (
        <div
          className={styles.overlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Product photo for ${productName}`}
            className={styles.dialog}
          >
            <div className={styles.header}>
              <h3 className={styles.title}>Product photo</h3>
              <button
                type="button"
                className={styles.closeButton}
                onClick={close}
                disabled={busy}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shownPhoto}
              alt={currentImageUrl ? 'Current product photo' : 'Selected photo preview'}
              className={`${styles.preview} ${
                previewUrl || currentImageUrl ? '' : styles.previewEmpty
              }`}
            />

            <span className={styles.hint}>
              {currentImageUrl
                ? 'Choose a new photo to replace this one.'
                : 'No photo yet. Choose one from your gallery.'}
            </span>

            {error && (
              <div role="alert" className={styles.errorBox}>
                {error}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void handleSelectImage(e.target.files?.[0])}
              hidden
            />

            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                data-testid="choose-photo-button"
              >
                {isUploading ? 'Uploading…' : 'Choose from gallery'}
              </button>
              {currentImageUrl && (
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => void handleRemove()}
                  disabled={busy}
                  data-testid="remove-photo-dialog-button"
                >
                  Remove
                </button>
              )}
            </div>

            {busy && (
              <span className={styles.hint} role="status">
                Saving…
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
