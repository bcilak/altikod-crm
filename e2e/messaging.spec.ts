import { test, expect, type Browser, type Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const origin = 'http://localhost:3100';
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b80000000049454e44ae426082', 'hex');
async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('E-posta', { exact: true }).fill(email);
  await page.getByLabel('Parola', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Giriş yap' }).click(); await expect(page).toHaveURL(/dashboard/);
  const me = await (await page.request.get('/api/v1/auth/me')).json();
  return async (method: 'post' | 'patch', path: string, data: object = {}) => { const r = await page.request[method](`/api/v1${path}`, { headers: { Origin: origin, 'X-CSRF-Token': me.csrfToken }, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json(); };
}
/** Invites a colleague and accepts through the link the local mail adapter wrote, as a real user would. */
async function colleague(browser: Browser, send: Awaited<ReturnType<typeof login>>, email: string, name: string) {
  await send('post', '/users/invitations', { email, name, role: 'SALES' });
  const dir = resolve(process.env.LOCAL_MAIL_DIR ?? '.local-mail');
  let url = '';
  for (const file of await readdir(dir)) { const mail = JSON.parse(await readFile(resolve(dir, file), 'utf8')); if (mail.to === email) url = mail.url; }
  const token = new URL(url).hash.slice('#token='.length);
  const page = await (await browser.newContext()).newPage(); const password = 'E2E-colleague-pass!42';
  expect((await page.request.post('/api/v1/auth/invitation/accept', { headers: { Origin: origin }, data: { token, password } })).ok()).toBeTruthy();
  await login(page, email, password);
  return page;
}

test('team messaging: channel, direct message, thread, unread badge, record conversation and mobile', async ({ page, browser }) => {
  page.on('dialog', dialog => dialog.accept());
  const send = await login(page, 'e2e-admin@example.invalid', 'E2E-only-password!42');
  const email = `e2e-sales-${Date.now()}@example.invalid`;
  const sales = await colleague(browser, send, email, 'E2E Satış Uzmanı');

  await page.getByRole('link', { name: /^Mesajlar/ }).click();
  await expect(page.getByRole('heading', { name: 'Mesajlar', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: /#genel/ }).click();
  await page.getByRole('button', { name: 'Kanala katıl' }).click();
  const composer = page.getByLabel('Mesaj yaz', { exact: true });
  await composer.fill('E2E merhaba ekip\nikinci satır'); await composer.press('Enter');
  await expect(page.getByRole('log', { name: 'Mesajlar' }).getByText('E2E merhaba ekip')).toBeVisible();
  await expect(composer).toHaveValue('');
  // @-mention: suggestions come up while typing; Enter picks the highlighted person instead of sending.
  await composer.pressSequentially('@E2E Sat');
  await expect(page.getByRole('listbox', { name: 'Bahsedilecek kişi' }).getByRole('option', { name: /E2E Satış Uzmanı/ })).toBeVisible();
  await composer.press('Enter');
  await expect(composer).toHaveValue('@E2E Satış Uzmanı ');
  await composer.pressSequentially('kanal toplantısı 14:00'); await composer.press('Enter');
  await expect(page.getByRole('log', { name: 'Mesajlar' }).locator('.mention', { hasText: '@E2E Satış Uzmanı' })).toBeVisible();

  // F8-06: edit with history, pin, search, knowledge suggestion and soft delete, all from the message actions menu.
  const log = page.getByRole('log', { name: 'Mesajlar' });
  const act = async (text: string, action: string) => { const item = log.locator('li.message').filter({ hasText: text }); await item.locator('summary', { hasText: 'İşlemler' }).click(); await item.getByRole('button', { name: action }).click(); return item; };
  const meeting = await act('kanal toplantısı 14:00', 'Düzenle');
  await meeting.getByLabel('Mesajı düzenle').fill('@E2E Satış Uzmanı kanal toplantısı 15:00'); await meeting.getByLabel('Mesajı düzenle').press('Enter');
  await expect(log.getByText('kanal toplantısı 15:00')).toBeVisible();
  const updated = log.locator('li.message').filter({ hasText: 'kanal toplantısı 15:00' });
  await updated.getByRole('button', { name: '(düzenlendi)' }).click();
  await expect(updated.getByRole('list', { name: 'Düzenleme geçmişi' }).getByText('kanal toplantısı 14:00')).toBeVisible();
  await act('kanal toplantısı 15:00', 'Sabitle');
  await expect(updated.locator('.badge', { hasText: 'Sabitlendi' })).toBeVisible();
  await page.locator('summary', { hasText: /^Sabitlenenler$/ }).click();
  await expect(page.locator('details', { has: page.locator('summary', { hasText: /^Sabitlenenler$/ }) }).getByText('kanal toplantısı 15:00')).toBeVisible();
  await page.getByLabel('Mesajlarda ara').fill('toplantı'); await page.getByLabel('Mesajlarda ara').press('Enter');
  await expect(page.getByRole('region', { name: 'Mesaj araması' }).locator('mark', { hasText: /toplantı/i }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Aramayı temizle' }).click();
  const hello = await act('E2E merhaba ekip', 'Bilgi bankasına öner');
  await hello.getByLabel('Kart başlığı').fill('E2E ekip notu'); await hello.getByLabel('Kategori').fill('Genel');
  await hello.getByRole('button', { name: 'Taslak oluştur' }).click();
  await expect(hello.getByRole('status')).toContainText('Taslak bilgi kartı oluşturuldu');
  await act('E2E merhaba ekip', 'Sil');
  await expect(log.getByText('Bu mesaj silindi.')).toBeVisible();
  await expect(log.getByText('E2E merhaba ekip')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/desktop-message-actions.png', fullPage: true });

  const direct = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Yeni birebir mesaj' }) });
  await direct.locator('summary').click();
  await direct.getByLabel('Ada göre ara').fill('E2E Satış');
  await direct.getByLabel(/E2E Satış Uzmanı/).check();
  await direct.getByRole('button', { name: 'Mesajlaşmaya başla' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Satış Uzmanı', level: 2 })).toBeVisible();
  await page.getByLabel('Mesaj yaz', { exact: true }).fill('Teklif taslağına bakabilir misin? https://example.invalid/teklif');
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect(page.getByRole('link', { name: 'https://example.invalid/teklif' })).toHaveAttribute('rel', 'noopener noreferrer');
  // Files: attached as drafts, sent with a message, downloadable by the other participant.
  await page.locator('form.composer input[type=file]').first().setInputFiles([{ name: 'Teklif taslağı.pdf', mimeType: 'application/pdf', buffer: pdf }, { name: 'ekran.png', mimeType: 'image/png', buffer: png }]);
  const drafts = page.getByRole('list', { name: 'Eklenecek dosyalar' });
  await expect(drafts.getByText('Teklif taslağı.pdf')).toBeVisible(); await expect(drafts.getByText('ekran.png')).toBeVisible();
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect(drafts).toHaveCount(0);
  await expect(page.getByRole('log', { name: 'Mesajlar' }).getByRole('link', { name: /Teklif taslağı\.pdf/ })).toBeVisible();
  await page.locator('form.composer input[type=file]').first().setInputFiles({ name: 'program.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ not a pdf') });
  await expect(page.locator('form.composer').getByRole('alert')).toContainText('program.pdf: Yalnız PDF');
  await page.screenshot({ path: 'test-results/desktop-messages.png', fullPage: true });

  // The colleague sees the unread badge in the menu, opens the conversation and answers in a thread.
  await sales.goto('/dashboard');
  await expect(sales.getByRole('link', { name: /Mesajlar.*2 okunmamış/ })).toBeVisible();
  await sales.getByRole('link', { name: /Mesajlar/ }).click();
  await sales.getByRole('link', { name: /DEMO E2E Admin.*2 okunmamış mesaj/ }).click();
  await expect(sales.getByText('Teklif taslağına bakabilir misin?')).toBeVisible();
  await expect(sales.getByRole('link', { name: /^Mesajlar$/ })).toBeVisible();
  const fileLink = sales.getByRole('log', { name: 'Mesajlar' }).getByRole('link', { name: /Teklif taslağı\.pdf/ });
  const [download] = await Promise.all([sales.waitForEvent('download'), fileLink.click()]);
  expect(download.suggestedFilename()).toBe('Teklif taslağı.pdf');
  const { readFile: read } = await import('node:fs/promises'); expect((await read((await download.path())!)).equals(pdf)).toBeTruthy();
  await expect(sales.getByRole('log', { name: 'Mesajlar' }).locator('img.file-thumb')).toHaveJSProperty('naturalWidth', 1);
  await sales.locator('summary', { hasText: /^Dosyalar$/ }).click();
  await expect(sales.locator('.shared-files').getByText('ekran.png')).toBeVisible();
  await sales.getByRole('button', { name: 'Yanıtla' }).first().click();
  await sales.getByLabel('Yanıt yaz').fill('Bakıyorum, öğleden sonra dönerim.'); await sales.getByLabel('Yanıt yaz').press('Enter');
  await expect(sales.getByRole('log', { name: 'Yanıtlar' }).getByText('Bakıyorum, öğleden sonra dönerim.')).toBeVisible();
  // Reactions: the colleague taps 👍 on the admin's message; the admin's open page shows it live.
  const asked = sales.getByRole('log', { name: 'Mesajlar' }).locator('li.message').filter({ hasText: 'Teklif taslağına bakabilir misin?' });
  await asked.getByLabel('Tepki ekle').first().click(); await asked.getByRole('button', { name: 'Beğendim' }).first().click();
  await expect(asked.getByRole('button', { name: /Beğendim: 1 kişi \(E2E Satış Uzmanı\), sizinki/ }).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('log', { name: 'Mesajlar' }).getByRole('button', { name: /Beğendim: 1 kişi \(E2E Satış Uzmanı\)$/ })).toBeVisible({ timeout: 5_000 });
  // Live update: the reply reaches the other open page well inside the 60 s safety-net poll.
  await expect(page.getByRole('button', { name: '1 yanıt' })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('canlı bağlantı yok')).toHaveCount(0);

  // The mention produced a notification that names the conversation and author but not the text.
  await expect(sales.getByRole('link', { name: /Bildirimler.*okunmamış/ })).toBeVisible({ timeout: 5_000 });
  await sales.getByRole('link', { name: /^Bildirimler/ }).click();
  const mentionNote = sales.locator('article').filter({ hasText: 'Sizden bahsedildi' });
  await expect(mentionNote.getByRole('link', { name: 'DEMO E2E Admin · #genel' })).toBeVisible();
  await expect(sales.getByText('kanal toplantısı')).toHaveCount(0);
  await mentionNote.getByRole('link', { name: 'DEMO E2E Admin · #genel' }).click();
  await expect(sales.locator('.mention.me', { hasText: '@E2E Satış Uzmanı' })).toBeVisible();

  // Record conversation lives on the company page and stays invisible to a colleague without access.
  const firm = await send('post', '/companies', { displayName: 'E2E Mesaj Firması', legalName: 'E2E Mesaj AŞ' });
  await page.goto(`/companies/${firm.id}`);
  await page.locator('summary', { hasText: /^Konuşma$/ }).click();
  const record = page.locator('details.record-conversation');
  await record.getByLabel('Mesaj yaz', { exact: true }).fill('Müşteri kurulum tarihini sordu.');
  await record.getByRole('button', { name: 'Gönder' }).click();
  await expect(record.getByText('Müşteri kurulum tarihini sordu.')).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop-record-conversation.png', fullPage: true });
  const conversationUrl = await record.getByRole('link', { name: 'Mesajlar’da aç' }).getAttribute('href');
  await sales.goto(conversationUrl!);
  await expect(sales.getByText('Konuşma bulunamadı')).toBeVisible();
  await expect(sales.getByText('Müşteri kurulum tarihini sordu.')).toHaveCount(0);
  await page.goto('/messages');
  await expect(page.getByRole('navigation', { name: 'Konuşmalar' }).getByRole('link', { name: /E2E Mesaj Firması/ })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/messages'); await expect(page.getByRole('heading', { name: 'Kanallar' })).toBeVisible(); expect(await noOverflow(page)).toBeTruthy();
  await page.screenshot({ path: 'test-results/mobile-messages-list.png', fullPage: true });
  await page.getByRole('link', { name: /E2E Satış Uzmanı/ }).click();
  await expect(page.getByText('Teklif taslağına bakabilir misin?')).toBeVisible(); expect(await noOverflow(page)).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Kanallar' })).toBeHidden();
  await page.screenshot({ path: 'test-results/mobile-messages.png', fullPage: true });
  await page.getByRole('button', { name: '← Konuşmalar' }).click();
  await expect(page.getByRole('heading', { name: 'Kanallar' })).toBeVisible();
  await page.goto(`/companies/${firm.id}`); expect(await noOverflow(page)).toBeTruthy();
  // F8-07 mobile pass: actions menu, inline edit form and search results fit 390 px.
  await page.goto('/messages'); await page.getByRole('link', { name: /#genel/ }).click();
  const mobileItem = page.getByRole('log', { name: 'Mesajlar' }).locator('li.message').filter({ hasText: 'kanal toplantısı 15:00' });
  await mobileItem.locator('summary', { hasText: 'İşlemler' }).click();
  await expect(mobileItem.getByRole('button', { name: 'Sabitlemeyi kaldır' })).toBeVisible(); expect(await noOverflow(page)).toBeTruthy();
  await page.screenshot({ path: 'test-results/mobile-message-actions.png', fullPage: true });
  await page.getByRole('button', { name: '← Konuşmalar' }).click();
  await page.getByLabel('Mesajlarda ara').fill('toplantı'); await page.getByLabel('Mesajlarda ara').press('Enter');
  await expect(page.getByRole('region', { name: 'Mesaj araması' }).locator('mark').first()).toBeVisible(); expect(await noOverflow(page)).toBeTruthy();
});
