import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';

let adminEmail = process.env.ADMIN_EMAIL;
let adminPassword = process.env.ADMIN_PASSWORD;
if (!adminEmail || !adminPassword) {
  if (!process.stdin.isTTY) throw new Error('Interactive terminal required, or set ADMIN_EMAIL and ADMIN_PASSWORD.');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  adminEmail ??= (await prompt.question('Yönetici e-posta adresi: ')).trim();
  prompt.close();
  if (!adminPassword) {
    process.stdout.write('Parola (en az 12 karakter, ekranda gösterilmez): ');
    adminPassword = await new Promise(resolve => {
      let value = '';
      process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
      const onData = chunk => {
        for (const char of chunk) {
          if (char === '\u0003') { process.stdin.setRawMode(false); process.exit(130); }
          if (char === '\r' || char === '\n') { process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); resolve(value); return; }
          if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
          else if (char >= ' ') value += char;
        }
      };
      process.stdin.on('data', onData);
    });
  }
}
const result = spawnSync(process.execPath, ['--env-file-if-exists=.env', 'apps/api/dist/src/bootstrap-admin.js'], { env: { ...process.env, ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminPassword }, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
