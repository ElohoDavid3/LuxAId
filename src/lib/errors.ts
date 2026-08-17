export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'UNKNOWN_PRODUCT'
  | 'PRODUCT_UNAVAILABLE'
  | 'UNKNOWN_CUSTOMER'
  | 'UNKNOWN_CONVERSATION'
  | 'INSUFFICIENT_STOCK'
  | 'INTERNAL_ERROR';

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  UNKNOWN_PRODUCT: 404,
  PRODUCT_UNAVAILABLE: 404,
  UNKNOWN_CUSTOMER: 404,
  UNKNOWN_CONVERSATION: 404,
  INSUFFICIENT_STOCK: 409,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = HTTP_STATUS[code];
  }
}
