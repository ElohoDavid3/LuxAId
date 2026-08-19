import {
  computeFlutterwaveSignature,
  verifyFlutterwaveSignature,
} from '../src/features/payments/signature';

describe('Flutterwave signature verification', () => {
  const SECRET_HASH = 'test-flw-secret-hash-12345';
  const RAW_BODY = JSON.stringify({
    event: 'charge.completed',
    data: { id: 12345, tx_ref: 'tx_abc123', status: 'successful', amount: 5000, currency: 'NGN' },
  });

  describe('computeFlutterwaveSignature', () => {
    it('computes consistent base64 HMAC-SHA256 signature', () => {
      const sig1 = computeFlutterwaveSignature(RAW_BODY, SECRET_HASH);
      const sig2 = computeFlutterwaveSignature(RAW_BODY, SECRET_HASH);
      expect(sig1).toBe(sig2);
      expect(typeof sig1).toBe('string');
      expect(sig1.length).toBeGreaterThan(0);
    });
  });

  describe('verifyFlutterwaveSignature', () => {
    it('accepts valid HMAC-SHA256 signature in flutterwave-signature header', () => {
      const validSig = computeFlutterwaveSignature(RAW_BODY, SECRET_HASH);
      const result = verifyFlutterwaveSignature(
        RAW_BODY,
        validSig,
        null,
        SECRET_HASH,
      );
      expect(result).toBe(true);
    });

    it('rejects invalid HMAC-SHA256 signature', () => {
      const result = verifyFlutterwaveSignature(
        RAW_BODY,
        'invalid-signature-value',
        null,
        SECRET_HASH,
      );
      expect(result).toBe(false);
    });

    it('accepts legacy verif-hash equality header when HMAC header is absent', () => {
      const result = verifyFlutterwaveSignature(
        RAW_BODY,
        null,
        SECRET_HASH,
        SECRET_HASH,
      );
      expect(result).toBe(true);
    });

    it('rejects invalid legacy verif-hash header', () => {
      const result = verifyFlutterwaveSignature(
        RAW_BODY,
        null,
        'wrong-secret-hash',
        SECRET_HASH,
      );
      expect(result).toBe(false);
    });

    it('rejects when both headers are missing', () => {
      const result = verifyFlutterwaveSignature(
        RAW_BODY,
        null,
        null,
        SECRET_HASH,
      );
      expect(result).toBe(false);
    });

    it('rejects when secret hash is empty or unconfigured', () => {
      const validSig = computeFlutterwaveSignature(RAW_BODY, SECRET_HASH);
      const result = verifyFlutterwaveSignature(
        RAW_BODY,
        validSig,
        null,
        '',
      );
      expect(result).toBe(false);
    });
  });
});
