import { test, expect } from '@playwright/test';
test('administrator creates and resets an email-free account; mobile first login requires password change', async ({ page, browser }) => {
  await page.goto('/login');
  await page.getByLabel('E-posta', { exact: true }).fill('e2e-admin@example.invalid');
  await page.getByLabel('Parola', { exact: true }).fill('E2E-only-password!42');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto('/settings/users');
  await page.getByLabel('Ad soyad', { exact: true }).first().fill('Managed Browser User');
  await page.getByLabel('Giriş e-postası').fill('managed-browser@example.invalid');
  await page.getByLabel('Rol', { exact: true }).first().selectOption('SALES');
  await page.getByLabel('Geçici parola', { exact: true }).fill('Temporary-browser!123');
  await page.getByRole('button', { name: 'Kullanıcı oluştur', exact: true }).click();
  await expect(page.locator('summary').filter({ hasText: 'Managed Browser User' })).toBeVisible();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await context.newPage();
  const login = async (password: string) => {
    await phone.goto('http://localhost:3100/login');
    await phone.getByLabel('E-posta', { exact: true }).fill('managed-browser@example.invalid');
    await phone.getByLabel('Parola', { exact: true }).fill(password);
    await phone.getByRole('button', { name: 'Giriş yap' }).click();
  };
  try {
    await login('Temporary-browser!123');
    await expect(phone).toHaveURL(/change-password/);
    await phone.goto('http://localhost:3100/tasks');
    await expect(phone).toHaveURL(/change-password/);
    await phone.getByLabel('Mevcut / geçici parola').fill('Temporary-browser!123');
    await phone.getByLabel('Yeni parola', { exact: true }).fill('Permanent-browser!456');
    await phone.getByLabel('Yeni parola tekrar').fill('Permanent-browser!456');
    await phone.getByRole('button', { name: 'Parolayı değiştir', exact: true }).click();
    await expect(phone).toHaveURL(/login/);
    await login('Permanent-browser!456'); await expect(phone).toHaveURL(/dashboard/);
    const entry = page.locator('details').filter({ has: page.locator('summary', { hasText: /^Managed Browser User/ }) });
    await entry.locator(':scope > summary').click();
    await entry.getByText('Parolayı sıfırla', { exact: true }).click();
    await entry.getByLabel('Yeni geçici parola').fill('Reset-browser-only!789');
    await entry.getByRole('button', { name: 'Geçici parola ata' }).click();
    await expect(entry.getByText('İlk girişte parola değişikliği bekleniyor.')).toBeVisible();
    await phone.reload(); await expect(phone).toHaveURL(/login/);
    await login('Reset-browser-only!789'); await expect(phone).toHaveURL(/change-password/);
    await expect(phone.locator('body')).toBeVisible();
  } finally { await context.close(); }
});
