import { createHmac, timingSafeEqual } from 'crypto';
import { getWhatsAppAppSecret } from './config';

/**
 * Verify the X-Hub-Signature-256 header against the raw request body.
 *
 * Meta signs the raw body with HMAC-SHA256 using the app secret.
 * The header format is: `sha256=<hex-digest>`.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 * Returns true only if the signature is valid.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;

  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) return false;

  const receivedHex = signatureHeader.slice(prefix.length);
  if (!receivedHex) return false;

  const appSecret = getWhatsAppAppSecret();
  const expectedDigest = createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  try {
    const receivedBuf = Buffer.from(receivedHex, 'hex');
    const expectedBuf = Buffer.from(expectedDigest, 'hex');

    if (receivedBuf.length !== expectedBuf.length) return false;

    return timingSafeEqual(receivedBuf, expectedBuf);
  } catch {
    return false;
  }
}
