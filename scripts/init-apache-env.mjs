// Run inside the built image with /config mounted to a root-only host directory.
// Never prints credentials; refuses to replace an existing deployment configuration.
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import webpush from 'web-push';

const [destination, domain, image] = process.argv.slice(2);
if (!destination || !domain || !/^[a-z0-9.-]+$/.test(domain) || !image || !/^[a-zA-Z0-9:._/-]+$/.test(image)) throw new Error('Usage: init-apache-env.mjs <destination> <domain> <image>');
const owner = randomBytes(32).toString('hex');
const runtime = randomBytes(32).toString('hex');
const keys = webpush.generateVAPIDKeys();
const config = {
  CRM_IMAGE: image, DOMAIN: domain, POSTGRES_PASSWORD: owner,
  MIGRATION_DATABASE_URL: `postgresql://saleshub:${owner}@postgres:5432/saleshub`,
  APP_DB_USER: 'saleshub_app', APP_DB_PASSWORD: runtime,
  DATABASE_URL: `postgresql://saleshub_app:${runtime}@postgres:5432/saleshub`,
  MAIL_TRANSPORT: 'disabled',
  WEB_PUSH_PUBLIC_KEY: keys.publicKey, WEB_PUSH_PRIVATE_KEY: keys.privateKey,
  WEB_PUSH_SUBJECT: `https://${domain}`, BACKUP_KEY: randomBytes(32).toString('hex'),
};
writeFileSync(destination, Object.entries(config).map(([key, value]) => `${key}=${value}\n`).join(''), { mode: 0o600, flag: 'wx' });
console.log('Configuration created. Credentials were not printed. Keep a secure separate copy of the backup key.');
