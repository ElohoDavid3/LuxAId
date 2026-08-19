import { createHmac, timingSafeEqual } from 'node:crypto';
import { getFlutterwaveSecretHash } from '../../lib/flutterwave';

/**
 * Computes the HMAC-SHA256 base64 signature documented by Flutterwave.
 */
export function computeFlutterwaveSignature(
  rawBody: string,
  secretHash: string,
): string {
  return createHmac('sha256', secretHash).update(rawBody).digest('base64');
}

/**
 * Timing-safe signature verifier for Flutterwave webhooks.
 * Prioritizes the HMAC-SHA256 `flutterwave-signature` header,
 * falling back to the legacy `verif-hash` header when absent.
 */
export function verifyFlutterwaveSignature(
  rawBody: string,
  signatureHeader?: string | null,
  legacyHashHeader?: string | null,
  secretHashOverride?: string,
): boolean {
  let secretHash: string;
  try {
    secretHash = secretHashOverride ?? getFlutterwaveSecretHash();
  } catch {
    return false;
  }

  if (!secretHash) return false;

  // Primary mechanism: HMAC-SHA256 base64
  if (signatureHeader) {
    const expectedSignature = computeFlutterwaveSignature(rawBody, secretHash);
    const receivedBuffer = Buffer.from(signatureHeader, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(receivedBuffer, expectedBuffer);
  }

  // Legacy fallback: verif-hash plain comparison (timing-safe)
  if (legacyHashHeader) {
    const receivedBuffer = Buffer.from(legacyHashHeader, 'utf8');
    const expectedBuffer = Buffer.from(secretHash, 'utf8');

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(receivedBuffer, expectedBuffer);
  }

  return false;
}
