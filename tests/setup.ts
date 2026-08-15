process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://luxaid:luxaid_dev_local@localhost:5432/luxaid_test?schema=public';

process.env.NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET ?? 'test-only-nextauth-secret-0123456789abcdef';

process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
