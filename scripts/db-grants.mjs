import { Client } from 'pg';
import { pathToFileURL } from 'node:url';

// Tables the API only appends to or reads. Everything else gets plain DML; nobody but the migrator gets DDL.
const appendOnly = ['AuditLog'];
const readOnly = ['system_metadata', 'RolePermission', '_prisma_migrations'];

/** Idempotent: creates or updates the runtime role and re-grants after every migration. Run with the migrator (owner) connection. */
export async function applyGrants(client, user, password) {
  if (!/^[a-z_][a-z0-9_]{2,62}$/.test(user)) throw new Error('APP_DB_USER must be a lowercase PostgreSQL identifier');
  if (!password || password.length < 16) throw new Error('APP_DB_PASSWORD must be at least 16 characters');
  const role = client.escapeIdentifier(user);
  const { rows: [owner] } = await client.query('SELECT current_user AS name, current_database() AS db');
  if (owner.name === user) throw new Error('Runtime role must differ from the migrator role');
  const exists = (await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [user])).rowCount;
  await client.query(`${exists ? 'ALTER' : 'CREATE'} ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${client.escapeLiteral(password)}`);
  const { rows: tables } = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  await client.query('BEGIN');
  try {
    await client.query(`REVOKE ALL ON DATABASE ${client.escapeIdentifier(owner.db)} FROM PUBLIC`);
    await client.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${client.escapeIdentifier(owner.db)} TO ${role}`);
    await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await client.query(`REVOKE ALL ON SCHEMA public FROM ${role}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    for (const { tablename } of tables) {
      const table = `public.${client.escapeIdentifier(tablename)}`;
      await client.query(`REVOKE ALL ON ${table} FROM ${role}`);
      const privileges = appendOnly.includes(tablename) ? 'SELECT, INSERT' : readOnly.includes(tablename) ? 'SELECT' : 'SELECT, INSERT, UPDATE, DELETE';
      await client.query(`GRANT ${privileges} ON ${table} TO ${role}`);
    }
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  return { role: user, tables: tables.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL required');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await applyGrants(client, process.env.APP_DB_USER ?? '', process.env.APP_DB_PASSWORD ?? '');
    console.log(`Runtime role ${result.role} granted on ${result.tables} tables.`);
  } finally { await client.end(); }
}
