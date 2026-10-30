import { test, expect, type Page } from '@playwright/test';
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
test('project delivery, knowledge card and academy quiz in the browser', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/login');
  await page.getByLabel('E-posta', { exact: true }).fill('e2e-admin@example.invalid');
  await page.getByLabel('Parola', { exact: true }).fill('E2E-only-password!42');
  await page.getByRole('button', { name: 'Giriş yap' }).click(); await expect(page).toHaveURL(/dashboard/);
  const me = await (await page.request.get('/api/v1/auth/me')).json();
  const send = async (method: 'post' | 'patch', path: string, data: object = {}) => { const r = await page.request[method](`/api/v1${path}`, { headers: { Origin: 'http://localhost:3100', 'X-CSRF-Token': me.csrfToken }, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json(); };

  const firm = await send('post', '/companies', { displayName: 'E2E Teslimat Firması', legalName: 'E2E Teslimat AŞ' });
  const opp = await send('post', '/opportunities', { companyId: firm.id, title: 'E2E Kablolama projesi', estimatedValue: '2000', currency: 'TRY', probability: 70, nextActionAt: '2030-01-01T00:00:00Z' });
  await send('post', `/opportunities/${opp.id}/stage-transitions`, { stage: 'WON', version: opp.version, reason: 'E2E sipariş onayı' });
  const handoff = await send('post', `/handoffs/from-opportunity/${opp.id}`, { ownerId: me.id, summary: 'İki katlı ofisin yapısal kablolaması', dueAt: '2030-03-01T09:00:00Z' });

  await page.getByRole('link', { name: 'Projeler', exact: true }).click();
  await page.getByRole('link', { name: 'E2E Kablolama projesi' }).click(); await expect(page).toHaveURL(new RegExp(`projects/${handoff.projectId}$`));
  await expect(page.getByText('İki katlı ofisin yapısal kablolaması')).toBeVisible();
  await page.getByText('Kilometre taşı ekle', { exact: true }).click();
  const milestoneForm = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Kilometre taşı ekle' }) }).locator('form');
  await milestoneForm.getByLabel('Kilometre taşı').fill('Saha keşfi');
  await milestoneForm.getByLabel('Hedef tarih (İstanbul)').fill('2030-01-10T10:00');
  await milestoneForm.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Saha keşfi')).toBeVisible();
  await page.getByRole('button', { name: 'Başlat / sürdür' }).click(); await expect(page.getByText('Sürüyor').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop-project.png', fullPage: true });

  await page.getByRole('link', { name: 'Bilgi bankası', exact: true }).click();
  await page.getByText('Yeni bilgi kartı', { exact: true }).click();
  await page.getByLabel('Kart başlığı *').fill('E2E Yapısal kablolama');
  await page.getByLabel('Kategori *').fill('Altyapı');
  await page.getByLabel('Kısa özet *').fill('Cat6A kablolama ve test raporu');
  await page.getByLabel('İhtiyaç keşif soruları').fill('Kaç kullanıcı var?\nKabinet yeri hazır mı?');
  await page.getByRole('button', { name: '+ İtiraz ekle' }).click();
  await page.getByLabel('İtiraz', { exact: true }).fill('Kablosuz yeterli');
  await page.getByLabel('Önerilen yanıt').fill('Kablolu omurga kararlılık sağlar');
  await page.getByRole('button', { name: 'Taslak olarak oluştur' }).click();
  await expect(page).toHaveURL(/knowledge\/[a-f0-9-]+$/);
  await expect(page.getByText('Henüz yayınlanmadı.')).toBeVisible();
  await page.getByRole('button', { name: 'İncelemeye gönder' }).click();
  await page.getByRole('button', { name: 'Onayla ve yayınla' }).click();
  await expect(page.getByText('Kablolu omurga kararlılık sağlar')).toBeVisible();
  await expect(page.getByText('Henüz yayınlanmadı.')).toHaveCount(0);
  const articleUrl = page.url();

  const course = await send('post', '/courses', { title: 'E2E Kablolama eğitimi', description: 'Temel kavramlar' });
  await send('post', `/courses/${course.id}/lessons`, { title: 'Cat6A nedir?', body: 'Cat6A, 10 Gbps için kullanılır.', passPct: 100, questions: [{ prompt: 'Cat6A hangi hız için uygundur?', options: ['100 Mbps', '10 Gbps'], correctIndex: 1 }] });
  await send('patch', `/courses/${course.id}`, { version: course.version, status: 'PUBLISHED' });
  await page.getByRole('link', { name: 'Akademi', exact: true }).click();
  await page.getByRole('link', { name: /E2E Kablolama eğitimi/ }).click();
  await page.getByLabel('100 Mbps').check(); await page.getByRole('button', { name: 'Cevapları gönder' }).click();
  await expect(page.getByText(/Puanınız %0/)).toBeVisible();
  await page.getByLabel('10 Gbps').check(); await page.getByRole('button', { name: 'Cevapları gönder' }).click();
  await expect(page.getByText(/Tebrikler, ders tamamlandı/)).toBeVisible();
  await expect(page.getByText('1 / 1 ders tamamlandı')).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop-academy.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of [articleUrl, `/projects/${handoff.projectId}`, '/academy']) { await page.goto(url); await expect(page.locator('h1')).toBeVisible(); expect(await noOverflow(page)).toBeTruthy(); }
  await page.goto(articleUrl); await expect(page.getByText('Kablolu omurga kararlılık sağlar')).toBeVisible(); await page.screenshot({ path: 'test-results/mobile-knowledge.png', fullPage: true });
});
