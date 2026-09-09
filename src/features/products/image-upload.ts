import { put } from '@vercel/blob';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
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

function validateImage(file: File): string {
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

  return extension;
}

async function storeLocally(
  businessId: string,
  buffer: Buffer,
  extension: string,
): Promise<UploadedProductImage> {
  const dir = join(process.cwd(), 'public', 'uploads', 'products', businessId);
  await mkdir(dir, { recursive: true });

  const filename = `${crypto.randomUUID()}.${extension}`;
  const filePath = join(dir, filename);
  await writeFile(filePath, buffer);

  return {
    url: `/uploads/products/${businessId}/${filename}`,
    pathname: `products/${businessId}/${filename}`,
  };
}

async function storeOnVercelBlob(
  pathname: string,
  buffer: Buffer,
  contentType: string,
): Promise<UploadedProductImage> {
  const blob = await put(pathname, buffer, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
  });
  return { url: blob.url, pathname: blob.pathname };
}

/**
 * Store a product image for a business.
 *
 * Uses Vercel Blob in production (when BLOB_READ_WRITE_TOKEN is set).
 * Falls back to local file system storage in development.
 * Returns the public URL to persist on the product record.
 */
export async function uploadProductImage(
  businessId: string,
  file: File,
): Promise<UploadedProductImage> {
  const extension = validateImage(file);

  const buffer = Buffer.from(await file.arrayBuffer());
  const pathname = `products/${businessId}/${crypto.randomUUID()}.${extension}`;

  try {
    if (env.BLOB_READ_WRITE_TOKEN) {
      return await storeOnVercelBlob(pathname, buffer, file.type);
    }
    return await storeLocally(businessId, buffer, extension);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      'INTEGRATION_FAILURE',
      'Could not store the image right now. Please try again.',
    );
  }
}
