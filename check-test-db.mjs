import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const migrations = await prisma.$queryRaw`
  SELECT migration_name, finished_at IS NOT NULL AS done
  FROM _prisma_migrations ORDER BY migration_name
`;
console.log(JSON.stringify(migrations, null, 2));

const tables = await prisma.$queryRaw`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LIMIT 20
`;
console.log('tables:', JSON.stringify(tables));

await prisma.$disconnect();
