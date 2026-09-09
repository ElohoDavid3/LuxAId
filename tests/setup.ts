process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://orderaid:orderaid_dev_local@localhost:5432/orderaid_test?schema=public';

process.env.NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET ?? 'test-only-nextauth-secret-0123456789abcdef';

process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

// The env module snapshots process.env at import time (before each test
// file's beforeAll runs), so webhook tests must get their secrets from here.
// These match the constants used in tests/whatsapp-webhook-integration.test.ts.
process.env.WHATSAPP_APP_SECRET =
  process.env.WHATSAPP_APP_SECRET ?? 'test-webhook-secret-for-integration';
process.env.WHATSAPP_VERIFY_TOKEN =
  process.env.WHATSAPP_VERIFY_TOKEN ?? 'test-verify-token-abc';
