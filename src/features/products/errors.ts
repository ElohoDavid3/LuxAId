import { AppError } from '../../lib/errors';

export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export function duplicateSkuError(): AppError {
  return new AppError(
    'VALIDATION_ERROR',
    'A variant with this SKU already exists for this business.',
  );
}
