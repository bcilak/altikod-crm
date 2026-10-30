import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
const hash = value => createHash('sha256').update(value).digest('hex');
const keyHex = process.env.BACKUP_KEY;
if (!keyHex || !/^[a-f0-9]{64}$/i.test(keyHex)) throw new Error('Set BACKUP_KEY to a securely stored 32-byte hexadecimal key.');
// Backup and restore need the owner role; the runtime role cannot create databases or read every catalog object.
const databaseUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL required');
const source = new URL(databaseUrl);
const dbName = decodeURIComponent(source.pathname.slice(1)); const dbUser = decodeURIComponent(source.username);
const filesRoot = resolve(process.env.PRIVATE_FILES_DIR ?? '.private-files');
const backupRoot = resolve(process.env.BACKUP_DIR ?? '.backups'); mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
const composeFile = process.env.BACKUP_COMPOSE_FILE ?? 'compose.yaml';
function command(tool, args, input) {
  const result = spawnSync('docker', ['compose', '-f', composeFile, 'exec', '-T', '-e', 'PGPASSWORD', 'postgres', tool, ...args], { env: { ...process.env, PGPASSWORD: decodeURIComponent(source.password) }, input, maxBuffer: 512 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Backup database command failed: ${tool}; no secrets printed.`);
  return result.stdout;
}
const sql = (database, statement) => command('psql', ['-U', dbUser, '-d', database, '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement]).toString().trim();
// Quote PDFs, knowledge attachments (Phase 6+) and message attachments (Phase 8+); older backups without those tables stay verifiable.
// Infected and retention-removed message files are deleted from storage and are deliberately not backed up.
const fileKey = /^[a-f0-9]{64}\.(pdf|png|jpg|docx|xlsx|pptx|csv|txt)$/;
const references = database => {
  const exists = table => sql(database, `SELECT to_regclass('public."${table}"') IS NOT NULL`) === 't';
  const knowledge = exists('KnowledgeAttachment') ? ` UNION ALL SELECT "fileKey", "checksum" FROM "KnowledgeAttachment"` : '';
  // Files removed by message retention (F8-06) are deleted from storage; older schemas have no removedAt column.
  const removedFilter = exists('MessageAttachment') && sql(database, `SELECT count(*) FROM information_schema.columns WHERE table_name = 'MessageAttachment' AND column_name = 'removedAt'`) === '1' ? '"removedAt" IS NULL' : 'true';
  const messages = exists('MessageAttachment') ? ` UNION ALL SELECT "fileKey", "checksum" FROM "MessageAttachment" WHERE "scanStatus" <> 'INFECTED' AND ${removedFilter}` : '';
  return JSON.parse(sql(database, `SELECT COALESCE(json_agg(json_build_object('key', k, 'checksum', c)), '[]'::json) FROM (SELECT "pdfKey" AS k, "pdfChecksum" AS c FROM "QuoteVersion" WHERE "pdfKey" IS NOT NULL${knowledge}${messages}) refs`));
};
const mode = process.argv[2] ?? 'create';
if (mode === 'create') {
  const dump = command('pg_dump', ['-U', dbUser, '-d', dbName, '-Fc', '--no-owner', '--no-privileges']);
  // PDFs are append-only. Reading references AFTER the consistent DB dump covers every referenced artifact in that snapshot.
  const files = [...new Map(references(dbName).map(file => [file.key, file])).values()].map(file => {
    if (!fileKey.test(file.key)) throw new Error('Unsafe artifact key');
    let bytes;
    if (process.env.BACKUP_IN_CONTAINER_FILES === 'true') {
      const result = spawnSync('docker', ['compose', '-f', composeFile, 'exec', '-T', 'api', 'cat', `/app/.private-files/${file.key}`], { maxBuffer: 25 * 1024 * 1024 });
      if (result.status !== 0) throw new Error('Private artifact read failed'); bytes = result.stdout;
    } else bytes = readFileSync(resolve(filesRoot, file.key));
    if (hash(bytes) !== file.checksum) throw new Error('Artifact checksum mismatch');
    return { ...file, bytes: bytes.toString('base64') };
  });
  const payload = Buffer.from(JSON.stringify({ format: 1, createdAt: new Date().toISOString(), dump: dump.toString('base64'), dumpChecksum: hash(dump), files }));
  if (payload.length > 250 * 1024 * 1024) throw new Error('Backup exceeds local adapter limit; use a streaming/offsite backup service.');
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const artifact = Buffer.concat([Buffer.from('SHB1'), iv, cipher.getAuthTag(), encrypted]);
  const output = resolve(backupRoot, `saleshub-${new Date().toISOString().replace(/[:.]/g, '-')}.shb`);
  writeFileSync(output, artifact, { mode: 0o600, flag: 'wx' }); console.log(JSON.stringify({ backup: output, files: files.length, encrypted: true }));
} else if (mode === 'verify' || mode === 'recover') {
  if (!process.argv[3]) throw new Error('Supply the encrypted backup path.');
  const file = readFileSync(resolve(process.argv[3])); if (file.subarray(0, 4).toString() !== 'SHB1') throw new Error('Invalid backup format');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), file.subarray(4, 16)); decipher.setAuthTag(file.subarray(16, 32));
  const payload = JSON.parse(Buffer.concat([decipher.update(file.subarray(32)), decipher.final()]).toString());
  const dump = Buffer.from(payload.dump, 'base64'); if (hash(dump) !== payload.dumpChecksum) throw new Error('Dump checksum mismatch');
  const database = `saleshub_restore_${randomBytes(8).toString('hex')}`;
  if (!/^saleshub_restore_[a-f0-9]{16}$/.test(database)) throw new Error('Unsafe restore target');
  let created = false;
  let recovered = false;
  const restoredFiles = mkdtempSync(resolve(backupRoot, 'restore-drill-'));
  if (!restoredFiles.startsWith(backupRoot + '\\') && !restoredFiles.startsWith(backupRoot + '/')) throw new Error('Unsafe cleanup path');
  try {
    sql(dbName, `CREATE DATABASE "${database}"`); created = true;
    command('pg_restore', ['-U', dbUser, '-d', database, '--no-owner', '--no-privileges', '--exit-on-error'], dump);
    const refs = references(database);
    for (const reference of refs) {
      const stored = payload.files.find(item => item.key === reference.key);
      if (!stored || stored.checksum !== reference.checksum || hash(Buffer.from(stored.bytes, 'base64')) !== reference.checksum) throw new Error('Restored DB/file consistency failed');
      if (!fileKey.test(reference.key)) throw new Error('Unsafe artifact key');
      const restoredPath = resolve(restoredFiles, reference.key);
      writeFileSync(restoredPath, Buffer.from(stored.bytes, 'base64'), { mode: 0o600 });
      if (hash(readFileSync(restoredPath)) !== reference.checksum) throw new Error('Restored file checksum mismatch');
    }
    const migrations = Number(sql(database, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'));
    if (migrations < 3) throw new Error('Missing migrations in restored database');
    recovered = mode === 'recover';
    console.log(JSON.stringify({ restored: true, target: recovered ? database : 'isolated disposable database', ...(recovered ? { privateFiles: restoredFiles, retained: true } : {}), migrations, verifiedFileReferences: refs.length }));
  } finally { if (!recovered) { if (created) sql(dbName, `DROP DATABASE "${database}" WITH (FORCE)`); rmSync(restoredFiles, { recursive: true, force: true }); } }
} else throw new Error('Use create, verify or recover. Production cutover must follow the recovery runbook.');
