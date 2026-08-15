process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://luxaid:luxaid_dev_local@localhost:5432/luxaid_test?schema=public';
