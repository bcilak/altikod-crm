import { test, expect, type Page } from '@playwright/test';
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-posta', { exact: true }).fill('e2e-admin@example.invalid');
  await page.getByLabel('Parola', { exact: true }).fill('E2E-only-password!42');
  await page.getByRole('button', { name: 'Giriş yap' }).click(); await expect(page).toHaveURL(/dashboard/);
}
// The lightweight headless shell has no notification support; the full Chromium build shows notifications headlessly.
test.use({ channel: 'chromium' });

test('a push message is shown by the service worker with a safe in-app link', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['notifications'], { origin: baseURL });
  await login(page);
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration('/'))?.active)).toBeTruthy();
  const cdp = await context.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  const registrationId = await new Promise<string>(resolve => { cdp.on('ServiceWorker.workerRegistrationUpdated', e => { const r = e.registrations.find(x => x.scopeURL.startsWith(baseURL!)); if (r) resolve(r.registrationId); }); });
  // Exactly what the API sends after decryption; the link must stay inside the site even if a payload says otherwise.
  await cdp.send('ServiceWorker.deliverPushMessage', { origin: baseURL!, registrationId, data: JSON.stringify({ title: 'Altıkod CRM', body: 'Yeni birebir mesaj · Ayşe', url: '/messages?c=abc', tag: 'conversation-abc', badge: 3 }) });
  await cdp.send('ServiceWorker.deliverPushMessage', { origin: baseURL!, registrationId, data: JSON.stringify({ title: 'Saldırı', body: 'x', url: '//evil.example.com/', tag: 'evil' }) });
  await expect.poll(() => page.evaluate(async () => (await (await navigator.serviceWorker.getRegistration('/'))!.getNotifications()).map(n => [n.title, n.body, n.tag, (n.data as { url: string }).url]))).toEqual([
    ['Altıkod CRM', 'Yeni birebir mesaj · Ayşe', 'conversation-abc', '/messages?c=abc'],
    ['Saldırı', 'x', 'evil', '/notifications'],
  ]);
});
