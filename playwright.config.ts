import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', workers: 1, timeout: 90_000,
  // next dev compiles each route on first client navigation; 5 s is too short on Windows.
  expect: { timeout: 20_000 },
  use: { baseURL: 'http://localhost:3100', browserName: 'chromium', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node apps/api/dist/src/main.js', url: 'http://127.0.0.1:3101/api/v1/ready', reuseExistingServer: false, timeout: 60_000 },
    { command: 'node node_modules/next/dist/bin/next dev apps/web --hostname 127.0.0.1 --port 3100', url: 'http://localhost:3100/login', reuseExistingServer: false, timeout: 120_000 },
  ],
});
