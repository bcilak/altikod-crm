import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

test('runtime database role is least-privileged', async t => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.startsWith('/saleshub_test_')) throw new Error('Isolated database required');
  if (!process.env.MIGRATION_DATABASE_URL || new URL(process.env.MIGRATION_DATABASE_URL).username === new URL(url).username) throw new Error('Tests must run as the separate runtime role');
  const db = new Client({ connectionString: url }); await db.connect();
  const denied = async (sql: string, params: unknown[] = []) => {
    await assert.rejects(db.query(sql, params), (error: { code?: string }) => error.code === '42501', sql);
  };
  try {
    await t.test('role has no superuser, role or database creation rights', async () => {
      const { rows: [role] } = await db.query('SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls FROM pg_roles WHERE rolname = current_user');
      assert.deepEqual(role, { rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false });
    });
    await t.test('schema changes are rejected', async () => {
      await denied('CREATE TABLE public.intruder (id int)');
      await denied('ALTER TABLE "Company" ADD COLUMN intruder int');
      await denied('DROP TABLE "Company"');
      await denied('TRUNCATE "Company"');
      await denied('DROP TRIGGER quote_delete_immutable ON "QuoteVersion"');
    });
    await t.test('audit log is append-only', async () => {
      await db.query('INSERT INTO "AuditLog" (id, action, entity) VALUES ($1, $2, $3)', [randomUUID(), 'ROLE_TEST', 'test']);
      await denied('UPDATE "AuditLog" SET action = $1', ['TAMPERED']);
      await denied('DELETE FROM "AuditLog"');
    });
    await t.test('permission matrix, metadata and migration history are read-only', async () => {
      assert.ok((await db.query('SELECT 1 FROM "RolePermission" LIMIT 1')).rowCount);
      await denied(`UPDATE "RolePermission" SET action = action`);
      await denied('DELETE FROM system_metadata');
      await denied('DELETE FROM "_prisma_migrations"');
    });
  } finally { await db.end(); }
});
