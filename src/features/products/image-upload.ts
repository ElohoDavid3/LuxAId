import { put } from '@vercel/blob';
import { env } from '../../lib/env';
import { AppError } from '../../lib/errors';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface UploadedProductImage {
  url: string;
  pathname: string;
}

/**
 * Store a product image for a business.
 *
 * Files are stored under a tenant-scoped path prefix so blobs are grouped
 * by business. Returns the public URL to persist on the product record.
 */
export async function uploadProductImage(
  businessId: string,
  file: File,
): Promise<UploadedProductImage> {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw new AppError(
      'INTEGRATION_FAILURE',
      'Image storage is not configured. Please contact support.',
    );
  }

  const extension = ALLOWED_IMAGE_TYPES[file.type];
  if (!extension) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Only JPG, PNG or WebP images are supported.',
    );
  }

  if (file.size <= 0) {
    throw new AppError('VALIDATION_ERROR', 'The selected file is empty.');
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Images must be 5MB or smaller. Please choose a smaller file.',
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const pathname = `products/${businessId}/${crypto.randomUUID()}.${extension}`;

  try {
    const blob = await put(pathname, buffer, {
      access: 'public',
      contentType: file.type,
      addRandomSuffix: false,
    });
    return { url: blob.url, pathname: blob.pathname };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      'INTEGRATION_FAILURE',
      'Could not store the image right now. Please try again.',
    );
  }
}
