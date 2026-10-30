import { existsSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (!existsSync('.env')) copyFileSync('.env.example', '.env');
if (!existsSync('apps/api/.env')) copyFileSync('.env', 'apps/api/.env');
function run(command, args) {
  const executable = command === 'npm' ? process.execPath : command;
  const argumentsList = command === 'npm' ? [process.env.npm_execpath, ...args] : args;
  const result = spawnSync(executable, argumentsList, { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error(`Setup stopped: ${command}. Check Docker Desktop and README prerequisites.`);
    process.exit(1);
  }
}
run('docker', ['compose', 'up', '-d', '--wait']);
run('npm', ['run', 'db:generate']);
run('npm', ['run', 'db:migrate']);
console.log('Local setup ready. Run npm run dev.');
