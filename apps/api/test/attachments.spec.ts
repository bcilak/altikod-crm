import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { crc32, deflateRawSync } from 'node:zlib';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { hashPassword } from '../src/auth/auth.service';
import { configureApp } from '../src/http';
import { Role } from '../src/generated/prisma/client';
import { ClamdScanner, MalwareScanner } from '../src/messaging/scanner';
import { MessageAttachmentsService } from '../src/messaging/attachments.service';
import { detectMessageFile } from '../src/messaging/file-types';
import { FilesService } from '../src/sales/files.service';
import { parseEnv } from '../src/env';

type Session = { cookie: string; csrf: string; id: string };
const origin = 'http://localhost:3000';
const nonce = () => randomBytes(12).toString('hex');
export const eicar = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
/** Minimal ZIP writer (deflate) for Office Open XML fixtures. */
export function zip(files: Record<string, string>) {
  const locals: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text); const data = deflateRawSync(raw); const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt32LE(crc32(raw), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(8, 10); entry.writeUInt32LE(crc32(raw), 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(raw.length, 24); entry.writeUInt16LE(nameBytes.length, 28); entry.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data); central.push(entry, nameBytes); offset += 30 + nameBytes.length + data.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
const contentTypes = (main: string) => `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/main.xml" ContentType="${main}"/></Types>`;
export const docx = zip({ '[Content_Types].xml': contentTypes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'), 'word/document.xml': '<w:document/>' });
const xlsx = zip({ '[Content_Types].xml': contentTypes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'), 'xl/workbook.xml': '<workbook/>' });
const pptx = zip({ '[Content_Types].xml': contentTypes('application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'), 'ppt/presentation.xml': '<p/>' });
const docm = zip({ '[Content_Types].xml': contentTypes('application/vnd.ms-word.document.macroEnabled.main+xml'), 'word/document.xml': '<w:document/>', 'word/vbaProject.bin': 'Attribute VB_Name' });
const hiddenMacro = zip({ '[Content_Types].xml': contentTypes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'), 'word/vbaProject.bin': 'x' });
const plainZip = zip({ 'a.txt': 'hello' });
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b80000000049454e44ae426082', 'hex');

/** Speaks clamd's INSTREAM protocol; flags the EICAR test string. Used when no real clamd (CLAMD_HOST) is configured. */
function fakeClamd(): Promise<Server> {
  const server = createServer(socket => {
    let buffer = Buffer.alloc(0); let body = Buffer.alloc(0); let prefix = false;
    socket.on('data', data => {
      buffer = Buffer.concat([buffer, data]);
      if (!prefix) { if (buffer.length < 10) return; assert.equal(buffer.subarray(0, 10).toString(), 'zINSTREAM\0'); buffer = buffer.subarray(10); prefix = true; }
      while (buffer.length >= 4) {
        const size = buffer.readUInt32BE(0);
        if (size === 0) { socket.end(body.includes(eicar) ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0'); return; }
        if (buffer.length < 4 + size) return;
        body = Buffer.concat([body, buffer.subarray(4, 4 + size)]); buffer = buffer.subarray(4 + size);
      }
    });
  });
  return new Promise(done => server.listen(0, '127.0.0.1', () => done(server)));
}

test('production refuses to start without a malware scanner', () => {
  const base = { NODE_ENV: 'production', APP_ORIGIN: 'https://crm.example.invalid', DATABASE_URL: 'postgresql://u:p@localhost:5432/db', MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.example.invalid', MAIL_FROM: 'CRM <crm@example.invalid>' };
  assert.throws(() => parseEnv(base), /MALWARE_SCANNER/);
  assert.throws(() => parseEnv({ ...base, MALWARE_SCANNER: 'clamd' }), /CLAMD_HOST/);
  assert.equal(parseEnv({ ...base, MALWARE_SCANNER: 'clamd', CLAMD_HOST: 'clamav' }).CLAMD_PORT, 3310);
  assert.equal(parseEnv({ NODE_ENV: 'development', DATABASE_URL: base.DATABASE_URL }).MALWARE_SCANNER, 'none');
});

test('file type detection trusts content, not names, and refuses macros', () => {
  const ok = (bytes: Buffer, name: string, extension: string) => assert.equal(detectMessageFile(bytes, name).extension, extension);
  const no = (bytes: Buffer, name: string, pattern: RegExp) => assert.throws(() => detectMessageFile(bytes, name), (e: Error) => pattern.test(e.message));
  ok(pdf, 'teklif.pdf', 'pdf'); ok(png, 'ekran.PNG', 'png'); ok(docx, 'şartname.docx', 'docx'); ok(xlsx, 'fiyat.xlsx', 'xlsx'); ok(pptx, 'sunum.pptx', 'pptx');
  ok(Buffer.from('ad;soyad\nAyşe;Yılmaz\n'), 'liste.csv', 'csv'); ok(Buffer.from('﻿notlar\n'), 'not.txt', 'txt');
  no(png, 'fatura.pdf', /uyuşmuyor; bu bir PNG/);
  no(docx, 'şartname.pdf', /uyuşmuyor; bu bir DOCX/);
  no(docm, 'rapor.docx', /Makro/); no(hiddenMacro, 'rapor.docx', /Makro/);
  no(plainZip, 'arsiv.zip', /Yalnız PDF/); no(plainZip, 'arsiv.docx', /Yalnız PDF|bozuk/);
  no(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]), 'kurulum.txt', /Yalnız PDF/);
  no(Buffer.from([0xc3, 0x28, 0x41]), 'bozuk.csv', /Yalnız PDF/);
  no(Buffer.from('MZ fake'), 'program.exe', /Yalnız PDF/);
  no(Buffer.concat([docx.subarray(0, 40)]), 'kirik.docx', /bozuk/);
});

test('Phase 8 (F8-04): message attachments, malware scanning and file access', async t => {
  if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.startsWith('/saleshub_test_')) throw new Error('Isolated database required');
  const fake = process.env.CLAMD_HOST ? undefined : await fakeClamd();
  Object.assign(process.env, { DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: 'test', MALWARE_SCANNER: 'clamd', CLAMD_HOST: process.env.CLAMD_HOST ?? '127.0.0.1', CLAMD_PORT: fake ? String((fake.address() as AddressInfo).port) : process.env.CLAMD_PORT ?? '3310' });
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication(); configureApp(app); await app.init(); const db = app.get(PrismaService);
  const scanner = app.get(MalwareScanner) as ClamdScanner; const jobs = app.get(MessageAttachmentsService); const files = app.get(FilesService);
  const realPort = scanner.port; const closed = await new Promise<number>(done => { const s = createServer().listen(0, '127.0.0.1', () => { const p = (s.address() as AddressInfo).port; s.close(() => done(p)); }); });
  const call = (s: Session, method: 'get' | 'post' | 'patch', path: string, body?: object) => {
    const r = request(app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', s.cookie).set('Origin', origin).set('X-CSRF-Token', s.csrf); return body ? r.send(body) : r;
  };
  const upload = (s: Session, conversationId: string, name: string, bytes: Buffer) => request(app.getHttpServer()).post(`/api/v1/messaging/conversations/${conversationId}/attachments?name=${encodeURIComponent(name)}`).set('Cookie', s.cookie).set('Origin', origin).set('X-CSRF-Token', s.csrf).set('Content-Type', 'application/octet-stream').send(bytes);
  const send = (s: Session, conversationId: string, body: string, attachmentIds: string[], clientNonce = nonce()) => call(s, 'post', `/messaging/conversations/${conversationId}/messages`, { body, attachmentIds, clientNonce });
  const download = (s: Session, id: string, inline = false) => request(app.getHttpServer()).get(`/api/v1/messaging/attachments/${id}${inline ? '?inline=1' : ''}`).set('Cookie', s.cookie).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
  const login = async (role: Role, name: string): Promise<Session> => {
    const email = `p8f-${name}@example.invalid`; const password = 'Test-only-password!42';
    await db.user.create({ data: { name, email, role, passwordHash: await hashPassword(password) } });
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', origin).send({ email, password }).expect(201);
    return { cookie: (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!, csrf: r.body.csrfToken, id: r.body.user.id };
  };
  const failure = (r: { body: Buffer }) => JSON.parse(r.body.toString()).error.message as string;
  const stored = () => existsSync(files.root()) ? readdirSync(files.root()) : [];
  try {
    const salesA = await login('SALES', 'sales-a'); const salesB = await login('SALES', 'sales-b'); const tech = await login('TECHNICAL', 'tech'); const viewer = await login('VIEWER', 'viewer');
    const dm = (await call(salesA, 'post', '/messaging/direct', { userId: salesB.id }).expect(201)).body;

    await t.test('drafts are private to the uploader until sent; sent files reach every participant with safe headers', async () => {
      const draft = (await upload(salesA, dm.id, 'Teknik şartname.docx', docx).expect(201)).body;
      assert.equal(draft.scanStatus, 'CLEAN'); assert.equal(draft.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      assert.equal((await download(salesA, draft.id).expect(200)).body.length, docx.length);
      await download(salesB, draft.id).expect(404);
      assert.equal((await call(salesB, 'get', `/messaging/conversations/${dm.id}/attachments`).expect(200)).body.length, 0);
      const message = (await send(salesA, dm.id, '', [draft.id]).expect(201)).body;
      assert.equal(message.body, ''); assert.deepEqual(message.attachments.map((a: { id: string }) => a.id), [draft.id]);
      const got = await download(salesB, draft.id).expect(200);
      assert.ok(got.body.equals(docx));
      assert.match(got.headers['content-disposition']!, /^attachment; filename="Teknik _artname.docx"; filename\*=UTF-8''Teknik%20%C5%9Fartname\.docx$/);
      assert.equal(got.headers['x-content-type-options'], 'nosniff'); assert.match(got.headers['content-security-policy']!, /sandbox/);
      const listed = (await call(salesB, 'get', `/messaging/conversations/${dm.id}/attachments`).expect(200)).body;
      assert.deepEqual(listed.map((a: { id: string; message: { id: string } }) => [a.id, a.message.id]), [[draft.id, message.id]]);
      assert.equal((await call(salesB, 'get', `/messaging/conversations/${dm.id}/messages`).expect(200)).body.items.at(-1).attachments[0].name, 'Teknik şartname.docx');
      for (const outsider of [tech, viewer]) await download(outsider, draft.id).expect(404);
      const image = (await upload(salesA, dm.id, 'ekran.png', png).expect(201)).body; const doc = (await upload(salesA, dm.id, 'teklif.pdf', pdf).expect(201)).body;
      await send(salesA, dm.id, 'Görsel ve PDF', [image.id, doc.id]).expect(201);
      assert.match((await download(salesB, image.id, true).expect(200)).headers['content-disposition']!, /^inline;/);
      assert.match((await download(salesB, doc.id, true).expect(200)).headers['content-disposition']!, /^attachment;/);
    });

    await t.test('attachments are linked once, only by their uploader, only in their own conversation', async () => {
      const a = (await upload(salesA, dm.id, 'liste.csv', Buffer.from('ad;tutar\nX;10\n')).expect(201)).body;
      const nonceA = nonce();
      const first = (await send(salesA, dm.id, 'Liste', [a.id], nonceA).expect(201)).body;
      assert.equal((await send(salesA, dm.id, 'Liste', [a.id], nonceA).expect(201)).body.id, first.id);
      await send(salesA, dm.id, 'Liste', [], nonceA).expect(409);
      await send(salesA, dm.id, 'Tekrar', [a.id]).expect(409);
      const foreign = (await upload(salesB, dm.id, 'not.txt', Buffer.from('not')).expect(201)).body;
      await send(salesA, dm.id, 'Başkasının dosyası', [foreign.id]).expect(409);
      const group = (await call(salesA, 'post', '/messaging/conversations', { kind: 'GROUP', name: 'Dosya grubu', memberIds: [salesB.id] }).expect(201)).body;
      const elsewhere = (await upload(salesA, group.id, 'grup.txt', Buffer.from('grup')).expect(201)).body;
      await send(salesA, dm.id, 'Yanlış konuşma', [elsewhere.id]).expect(409);
      await send(salesA, dm.id, '', []).expect(400);
      const ids = await Promise.all([1, 2, 3, 4, 5, 6].map(async i => (await upload(salesA, group.id, `parca${i}.txt`, Buffer.from(`parça ${i}`)).expect(201)).body.id));
      await send(salesA, group.id, 'Çok fazla', ids).expect(400);
      assert.equal(await db.message.count({ where: { conversationId: group.id } }), 0);
      await call(salesA, 'post', `/messaging/attachments/${ids[0]}/remove`).expect(201);
      await call(salesB, 'post', `/messaging/attachments/${ids[1]}/remove`).expect(404);
      await call(salesA, 'post', `/messaging/attachments/${first.attachments[0].id}/remove`).expect(404);
    });

    await t.test('upload validation: type from content, size, name, permissions', async () => {
      assert.match((await upload(salesA, dm.id, 'fatura.pdf', png).expect(400)).body.error.message, /uyuşmuyor/);
      assert.match((await upload(salesA, dm.id, 'rapor.docx', docm).expect(400)).body.error.message, /Makro/);
      await upload(salesA, dm.id, 'arsiv.zip', plainZip).expect(400);
      await upload(salesA, dm.id, '../../etc/passwd.txt', Buffer.from('x')).expect(400);
      const big = (await upload(salesA, dm.id, 'buyuk.txt', Buffer.alloc(20 * 1024 * 1024 + 1, 0x61)).expect(413)).body;
      assert.equal(big.error.code, 'PAYLOAD_TOO_LARGE');
      await upload(tech, dm.id, 'x.txt', Buffer.from('x')).expect(404);
      const genel = (await call(viewer, 'get', '/messaging/conversations?kind=CHANNEL').expect(200)).body.items.find((c: { name: string }) => c.name === 'genel');
      await call(viewer, 'post', `/messaging/conversations/${genel.id}/join`).expect(201);
      await upload(viewer, genel.id, 'x.txt', Buffer.from('x')).expect(403);
    });

    await t.test('infected uploads are refused before storage and audited', async () => {
      const before = stored().length;
      assert.match((await upload(salesA, dm.id, 'eicar.txt', eicar).expect(400)).body.error.message, /zararlı içerik/);
      assert.equal(stored().length, before);
      assert.equal(await db.messageAttachment.count({ where: { name: 'eicar.txt' } }), 0);
      const log = await db.auditLog.findFirstOrThrow({ where: { action: 'MALWARE_BLOCKED', actorId: salesA.id } });
      assert.match(JSON.stringify(log.metadata), /EICAR|Eicar/);
    });

    await t.test('scanner outage keeps files blocked; retries release clean files, quarantine infected ones and give up after five tries', async st => {
      scanner.port = closed;
      st.after(() => { scanner.port = realPort; });
      const failing = (await upload(salesA, dm.id, 'kalici.txt', Buffer.from('kalıcı arıza')).expect(201)).body;
      assert.equal(failing.scanStatus, 'PENDING');
      await send(salesA, dm.id, 'Taranamayan', [failing.id]).expect(201);
      assert.match(failure(await download(salesB, failing.id).expect(409)), /taraması sürüyor/);
      for (let i = 0; i < 4; i++) await jobs.scanPending();
      assert.equal((await db.messageAttachment.findUniqueOrThrow({ where: { id: failing.id } })).scanStatus, 'FAILED');
      assert.match(failure(await download(salesB, failing.id).expect(409)), /tamamlanamadı/);

      const pending = (await upload(salesA, dm.id, 'bekleyen.pdf', pdf).expect(201)).body;
      const hidden = (await upload(salesA, dm.id, 'gizli.txt', eicar).expect(201)).body;
      assert.deepEqual([pending.scanStatus, hidden.scanStatus], ['PENDING', 'PENDING']);
      await send(salesA, dm.id, 'Taranıyor', [pending.id, hidden.id]).expect(201);
      await download(salesB, pending.id).expect(409);
      scanner.port = realPort;
      await jobs.scanPending();
      assert.equal((await db.messageAttachment.findUniqueOrThrow({ where: { id: pending.id } })).scanStatus, 'CLEAN');
      assert.ok((await download(salesB, pending.id).expect(200)).body.equals(pdf));
      const infected = await db.messageAttachment.findUniqueOrThrow({ where: { id: hidden.id } });
      assert.equal(infected.scanStatus, 'INFECTED'); assert.match(infected.scanSignature!, /EICAR|Eicar/);
      assert.ok(!stored().includes(infected.fileKey));
      assert.match(failure(await download(salesB, hidden.id).expect(409)), /zararlı/);
      assert.ok(await db.auditLog.findFirst({ where: { action: 'MALWARE_DETECTED', entityId: hidden.id } }));
      assert.equal((await db.messageAttachment.findUniqueOrThrow({ where: { id: failing.id } })).scanStatus, 'FAILED');
    });

    await t.test('record conversation files follow record access, including revocation', async () => {
      const company = (await call(salesA, 'post', '/companies', { displayName: 'P8F Firma', legalName: 'P8F Firma AŞ' }).expect(201)).body;
      await call(salesA, 'post', `/companies/${company.id}/shares`, { userId: salesB.id, permission: 'READ' }).expect(201);
      const conv = (await call(salesA, 'post', '/messaging/record-conversations', { recordType: 'COMPANY', recordId: company.id }).expect(201)).body;
      const file = (await upload(salesA, conv.id, 'sozlesme.pdf', pdf).expect(201)).body;
      await send(salesA, conv.id, 'Sözleşme taslağı', [file.id]).expect(201);
      await upload(salesB, conv.id, 'okur.txt', Buffer.from('x')).expect(403);
      await download(salesB, file.id).expect(200);
      await call(salesA, 'post', `/companies/${company.id}/shares`, { userId: salesB.id, permission: 'NONE' }).expect(201);
      await download(salesB, file.id).expect(404);
      await call(salesB, 'get', `/messaging/conversations/${conv.id}/attachments`).expect(404);
    });

    await t.test('unsent drafts expire; database guards keep linked files immutable and infected files blocked', async () => {
      const draft = (await upload(salesA, dm.id, 'unutulan.txt', Buffer.from('unutulan taslak')).expect(201)).body;
      const row = await db.messageAttachment.findUniqueOrThrow({ where: { id: draft.id } });
      assert.equal(await jobs.cleanupDrafts(Date.now()), 0);
      assert.ok(await jobs.cleanupDrafts(Date.now() + 25 * 3600_000) >= 1);
      assert.equal(await db.messageAttachment.count({ where: { id: draft.id } }), 0);
      assert.ok(!stored().includes(row.fileKey));
      const linked = await db.messageAttachment.findFirstOrThrow({ where: { messageId: { not: null }, scanStatus: 'CLEAN' } });
      await assert.rejects(db.messageAttachment.update({ where: { id: linked.id }, data: { name: 'değişti.pdf' } }));
      await assert.rejects(db.messageAttachment.update({ where: { id: linked.id }, data: { messageId: null } }));
      await assert.rejects(db.messageAttachment.delete({ where: { id: linked.id } }));
      const infected = await db.messageAttachment.findFirstOrThrow({ where: { scanStatus: 'INFECTED' } });
      await assert.rejects(db.messageAttachment.update({ where: { id: infected.id }, data: { scanStatus: 'CLEAN', scanSignature: null } }));
    });
  } finally {
    await db.rateLimit.deleteMany({});
    await app.close(); fake?.close();
  }
});
