import { test, expect, type Page } from '@playwright/test';
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-posta', { exact: true }).fill('e2e-admin@example.invalid');
  await page.getByLabel('Parola', { exact: true }).fill('E2E-only-password!42');
  await page.getByRole('button', { name: 'Giriş yap' }).click(); await expect(page).toHaveURL(/dashboard/);
}

test('installable app: manifest, icons, service worker and Chrome installability check', async ({ page, context }) => {
  await login(page);
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'Altıkod CRM', display: 'standalone', start_url: '/dashboard', lang: 'tr' });
  for (const icon of manifest.icons) { const r = await page.request.get(icon.src); expect(r.ok()).toBeTruthy(); expect(r.headers()['content-type']).toContain('image/png'); }
  const sw = await page.request.get('/sw.js');
  expect(sw.headers()['cache-control']).toContain('no-store'); expect(await sw.text()).not.toContain("addEventListener('fetch'");
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration('/'))?.active)).toBeTruthy();
  const cdp = await context.newCDPSession(page);
  expect((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Altıkod CRM');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
});

test('iPhone: home-screen guidance, settings fit the screen, push is configured on the server', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: iphone, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await login(page);
  await page.goto('/notifications');
  await page.locator('summary', { hasText: 'Telefon ve bilgisayar bildirimleri' }).click();
  await expect(page.getByText('Ana Ekrana Ekle')).toBeVisible();
  await expect(page.getByText('henüz yapılandırılmadı')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bu cihazda bildirimleri aç' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/iphone-notifications.png', fullPage: true });
  await context.close();
});
