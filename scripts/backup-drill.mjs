import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const env = { ...process.env, BACKUP_KEY: randomBytes(32).toString('hex'), BACKUP_DIR: '.tmp/backup-drill' };
function run(args) { const result = spawnSync(process.execPath, ['--env-file-if-exists=.env', 'scripts/backup.mjs', ...args], { env, encoding: 'utf8' }); if (result.status !== 0) throw new Error('Backup drill failed: ' + result.stderr); return result.stdout.trim(); }
const backup = JSON.parse(run(['create']));
console.log(run(['verify', backup.backup]));
console.log('Drill-only encryption key discarded. This artifact is NOT a retained recovery backup.');
