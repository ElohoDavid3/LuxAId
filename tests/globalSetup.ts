import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

const projectRoot = path.join(__dirname, '..');

export default function globalSetup(): void {
  const testUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://luxaid:luxaid_dev_local@localhost:5432/luxaid_test?schema=public';
  const cli = path.join(projectRoot, 'node_modules', 'prisma', 'build', 'index.js');

  execFileSync('node', [cli, 'migrate', 'deploy'], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: testUrl, PRISMA_DISABLE_TELEMETRY: '1' },
    stdio: 'inherit',
  });
}
