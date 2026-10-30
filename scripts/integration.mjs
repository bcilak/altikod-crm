import { Client } from 'pg';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { applyGrants } from './db-grants.mjs';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const database = `saleshub_test_${randomBytes(8).toString('hex')}`;
const appRole = `saleshub_app_${randomBytes(8).toString('hex')}`;
if (!/^saleshub_test_[a-f0-9]{16}$/.test(database)) throw new Error('Unsafe test database name');
const source = new URL(process.env.DATABASE_URL);
const testUrl = new URL(source); testUrl.pathname = `/${database}`;
const client = new Client({ connectionString: source.toString() });
await client.connect();
let created = false; let roleCreated = false;
try {
  await client.query(`CREATE DATABASE "${database}"`); created = true;
  const env = { ...process.env, DATABASE_URL: testUrl.toString(), TEST_DATABASE_URL: testUrl.toString(), PRIVATE_FILES_DIR: `.tmp/${database}-files`, NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:3000' };
  const migrate = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'db:migrate'], { env, stdio: 'inherit' });
  if (migrate.status !== 0) throw new Error('Test database migration failed');
  // Run the app and tests as the least-privileged runtime role, exactly as production does; only migrate/backup use the owner.
  const appPassword = randomBytes(24).toString('hex');
  const owner = new Client({ connectionString: testUrl.toString() }); await owner.connect();
  try { roleCreated = true; await applyGrants(owner, appRole, appPassword); } finally { await owner.end(); }
  const appUrl = new URL(testUrl); appUrl.username = appRole; appUrl.password = appPassword;
  const ownerUrl = env.DATABASE_URL;
  Object.assign(env, { DATABASE_URL: appUrl.toString(), TEST_DATABASE_URL: appUrl.toString(), MIGRATION_DATABASE_URL: ownerUrl });
  const browser = process.argv.includes('--browser');
  if (browser) {
    env.APP_ORIGIN = 'http://localhost:3100'; env.PORT = '3101'; env.API_INTERNAL_URL = 'http://127.0.0.1:3101'; env.NEXT_DIST_DIR = '.next-e2e';
    env.ADMIN_EMAIL = 'e2e-admin@example.invalid'; env.ADMIN_PASSWORD = 'E2E-only-password!42'; env.ADMIN_NAME = 'DEMO E2E Admin';
    const seed = spawnSync(process.execPath, ['apps/api/dist/src/bootstrap-admin.js'], { env, stdio: 'inherit' });
    if (seed.status !== 0) throw new Error('Test bootstrap failed');
  }
  const result = spawnSync(process.execPath, browser ? ['node_modules/@playwright/test/cli.js', 'test'] : ['--test', '--test-concurrency=1', 'apps/api/dist/test/integration.spec.js', 'apps/api/dist/test/sales.spec.js', 'apps/api/dist/test/phase6.spec.js', 'apps/api/dist/test/messaging.spec.js', 'apps/api/dist/test/attachments.spec.js', 'apps/api/dist/test/messaging-live.spec.js', 'apps/api/dist/test/mail.spec.js', 'apps/api/dist/test/db-roles.spec.js'], { env, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
  if (!browser && result.status === 0 && process.argv.includes('--backup-drill')) {
    const drill = spawnSync(process.execPath, ['scripts/backup-drill.mjs'], { env: { ...env, DATABASE_URL: env.MIGRATION_DATABASE_URL }, stdio: 'inherit' });
    process.exitCode = drill.status ?? 1;
  }
} finally {
  if (created) await client.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  if (roleCreated) await client.query(`DROP ROLE IF EXISTS "${appRole}"`);
  await client.end();
}
