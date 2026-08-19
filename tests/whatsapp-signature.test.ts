process.env.WHATSAPP_APP_SECRET = 'test-whatsapp-app-secret-12345';

import { createHmac } from 'crypto';
import { verifyWebhookSignature } from '../src/features/whatsapp/signature';

const TEST_SECRET = 'test-whatsapp-app-secret-12345';

function computeSignature(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('WhatsApp signature verification', () => {
  it('returns true for a valid signature', () => {
    const body = '{"object":"whatsapp_business_account","entry":[]}';
    const sig = computeSignature(TEST_SECRET, body);
    expect(verifyWebhookSignature(body, sig)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const body = '{"object":"whatsapp_business_account","entry":[]}';
    expect(verifyWebhookSignature(body, 'sha256=0000000000000000000000000000000000000000000000000000000000000000')).toBe(false);
  });

  it('returns false for a missing signature', () => {
    const body = '{"object":"whatsapp_business_account","entry":[]}';
    expect(verifyWebhookSignature(body, null)).toBe(false);
  });

  it('returns false for a signature with wrong prefix', () => {
    const body = '{"object":"whatsapp_business_account","entry":[]}';
    expect(verifyWebhookSignature(body, 'md5=abc123')).toBe(false);
  });

  it('returns false for an empty signature string', () => {
    const body = '{"object":"whatsapp_business_account","entry":[]}';
    expect(verifyWebhookSignature(body, 'sha256=')).toBe(false);
  });

  it('returns false for a non-hex signature value', () => {
    const body = '{"object":"whatsapp_business_account","entry":[]}';
    expect(verifyWebhookSignature(body, 'sha256=not-a-hex-string')).toBe(false);
  });

  it('returns true with a Buffer body', () => {
    const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
    const sig = computeSignature(TEST_SECRET, body.toString());
    expect(verifyWebhookSignature(body, sig)).toBe(true);
  });
});
