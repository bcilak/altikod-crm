import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import type { MessageAttachmentExtension } from '@saleshub/shared';

export type QuoteSnapshot = { number: string; version: number; title: string; currency: string; validUntil: string; seller: { name: string; address: string; email: string }; company: { name: string; address: string }; terms: string; lines: { description: string; quantity: string; unitPrice: string; discountPct: string; taxPct: string; net: string; tax: string; total: string }[]; subtotal: string; discountTotal: string; taxTotal: string; total: string; template: string };
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function quoteHtml(s: QuoteSnapshot) {
  return `<!doctype html><html lang="tr"><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{font:12px Arial,sans-serif;color:#253044}h1{font-size:26px}header{border-bottom:3px solid #6434df;padding-bottom:18px}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{border-bottom:1px solid #ccc;padding:9px 5px;text-align:left;vertical-align:top}th{background:#f1ebff}tr{break-inside:avoid}td:first-child{white-space:pre-wrap;overflow-wrap:anywhere}.summary{text-align:right;line-height:1.8}.terms{white-space:pre-wrap;overflow-wrap:anywhere}footer{font-size:10px;margin-top:24px;color:#525b6a}</style><header><h1>${escape(s.seller.name)}</h1><p>${escape(s.seller.address)} · ${escape(s.seller.email)}</p></header><h2>${escape(s.title)}</h2><p>Teklif: ${escape(s.number)} / V${s.version} · Geçerlilik: ${escape(new Date(s.validUntil).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }))}</p><p><strong>${escape(s.company.name)}</strong><br>${escape(s.company.address)}</p><table><thead><tr><th>Kalem</th><th>Miktar</th><th>Birim fiyat</th><th>İskonto %</th><th>KDV %</th><th>Toplam</th></tr></thead><tbody>${s.lines.map(l => `<tr><td>${escape(l.description)}</td><td>${escape(l.quantity)}</td><td>${escape(l.unitPrice)}</td><td>${escape(l.discountPct)}</td><td>${escape(l.taxPct)}</td><td>${escape(l.total)}</td></tr>`).join('')}</tbody></table><div class="summary">Ara toplam: ${escape(s.subtotal)} ${escape(s.currency)}<br>Toplam indirim: ${escape(s.discountTotal)} ${escape(s.currency)}<br>KDV: ${escape(s.taxTotal)} ${escape(s.currency)}<br><strong>Genel toplam: ${escape(s.total)} ${escape(s.currency)}</strong></div><h3>Teklif şartları</h3><p class="terms">${escape(s.terms)}</p><footer>Bu belge teklif sürümünün sabit içeriğinden üretilmiştir. Müşteriye teslim veya elektronik imza doğrulaması değildir.</footer></html>`;
}
const fileKeyPattern = /^[a-f0-9]{64}\.(pdf|png|jpg|docx|xlsx|pptx|csv|txt)$/;
@Injectable()
export class FilesService {
  root() { return resolve(process.env.PRIVATE_FILES_DIR ?? '.private-files'); }
  async createPdf(snapshot: QuoteSnapshot) {
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ javaScriptEnabled: false });
      await context.route('**/*', route => route.abort());
      const page = await context.newPage();
      await page.setContent(quoteHtml(snapshot), { waitUntil: 'load' });
      const bytes = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
      return { ...await this.store(bytes, 'pdf'), bytes };
    } finally { await browser.close(); }
  }
  /** Content-addressed, write-once storage outside the web root. */
  async store(bytes: Uint8Array, extension: MessageAttachmentExtension) {
    const checksum = createHash('sha256').update(bytes).digest('hex'); const key = `${checksum}.${extension}`;
    await mkdir(this.root(), { recursive: true, mode: 0o700 });
    try { await writeFile(resolve(this.root(), key), bytes, { flag: 'wx', mode: 0o600 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    return { key, checksum };
  }
  async read(key: string, checksum: string) {
    if (!fileKeyPattern.test(key)) throw new ServiceUnavailableException('Geçersiz dosya kaydı');
    const bytes = await readFile(resolve(this.root(), key));
    if (createHash('sha256').update(bytes).digest('hex') !== checksum) throw new ServiceUnavailableException('Dosya bütünlüğü doğrulanamadı');
    return bytes;
  }
  /** Removes a stored file. Callers must first make sure no record (quote, knowledge or message attachment) still references the key. */
  async remove(key: string) {
    if (!fileKeyPattern.test(key)) throw new ServiceUnavailableException('Geçersiz dosya kaydı');
    try { await unlink(resolve(this.root(), key)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
