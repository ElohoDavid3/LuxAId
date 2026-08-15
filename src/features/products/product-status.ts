import { ProductStatus } from '@prisma/client';
import { AppError } from '../../lib/errors';

const ALLOWED_TRANSITIONS: Record<ProductStatus, readonly ProductStatus[]> = {
  [ProductStatus.DRAFT]: [
    ProductStatus.DRAFT,
    ProductStatus.ACTIVE,
    ProductStatus.ARCHIVED,
  ],
  [ProductStatus.ACTIVE]: [ProductStatus.ACTIVE, ProductStatus.ARCHIVED],
  [ProductStatus.ARCHIVED]: [ProductStatus.ARCHIVED],
};

export function assertProductStatusTransition(
  from: ProductStatus,
  to: ProductStatus,
): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Cannot change product status from ${from} to ${to}.`,
    );
  }
}
