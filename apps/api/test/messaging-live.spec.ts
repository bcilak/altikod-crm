import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { hashPassword } from '../src/auth/auth.service';
import { configureApp } from '../src/http';
import { Role } from '../src/generated/prisma/client';
import { MessagingStream } from '../src/messaging/stream.service';

type Session = { cookie: string; csrf: string; id: string };
type Stream = { events: { event: string; data: Record<string, unknown> }[]; ended: boolean; status?: number; headers?: Record<string, unknown>; close: () => void };
const origin = 'http://localhost:3000';
const nonce = () => randomBytes(12).toString('hex');
async function until(condition: () => boolean, ms = 4000) {
  const start = Date.now();
  while (!condition()) { if (Date.now() - start > ms) throw new Error('Timed out waiting for stream'); await sleep(20); }
}

test('Phase 8 (F8-05): mentions, message notifications and live updates', async t => {
  if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.startsWith('/saleshub_test_')) throw new Error('Isolated database required');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; process.env.NODE_ENV = 'test';
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication(); configureApp(app); await app.listen(0, '127.0.0.1'); const db = app.get(PrismaService);
  const port = (app.getHttpServer().address() as AddressInfo).port;
  app.get(MessagingStream).heartbeatMs = 200;
  const call = (s: Session, method: 'get' | 'post' | 'patch', path: string, body?: object) => {
    const r = request(app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', s.cookie).set('Origin', origin).set('X-CSRF-Token', s.csrf); return body ? r.send(body) : r;
  };
  const post = (s: Session, conversationId: string, body: string, extra: object = {}) => call(s, 'post', `/messaging/conversations/${conversationId}/messages`, { body, clientNonce: nonce(), ...extra });
  const login = async (role: Role, name: string): Promise<Session> => {
    const email = `p8l-${name}@example.invalid`; const password = 'Test-only-password!42';
    await db.user.create({ data: { name, email, role, passwordHash: await hashPassword(password) } });
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', origin).send({ email, password }).expect(201);
    return { cookie: (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!, csrf: r.body.csrfToken, id: r.body.user.id };
  };
  const streams: Stream[] = [];
  const open = (s?: Session): Promise<Stream> => new Promise(done => {
    const stream: Stream = { events: [], ended: false, close: () => req.destroy() }; streams.push(stream);
    const req = httpRequest({ host: '127.0.0.1', port, path: '/api/v1/messaging/stream', headers: s ? { cookie: s.cookie } : {} }, res => {
      stream.status = res.statusCode; stream.headers = res.headers; let buffer = ''; res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk; let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const event = /^event: (.+)$/m.exec(block)?.[1]; if (event) stream.events.push({ event, data: JSON.parse(/^data: (.+)$/m.exec(block)?.[1] ?? '{}') });
        }
        if (stream.events.some(e => e.event === 'ready')) done(stream);
      });
      res.on('end', () => { stream.ended = true; done(stream); });
      if (res.statusCode !== 200) res.resume();
    });
    req.on('error', () => { stream.ended = true; done(stream); }); req.end();
  });
  const got = (s: Stream, event: string, conversationId?: string) => s.events.filter(e => e.event === event && (!conversationId || e.data.conversationId === conversationId)).length;
  try {
    const admin = await login('ADMIN', 'admin'); const salesA = await login('SALES', 'sales-a'); const salesB = await login('SALES', 'sales-b');
    const tech = await login('TECHNICAL', 'tech'); const viewer = await login('VIEWER', 'viewer');

    await t.test('mentions are limited to people who can already read the conversation', async () => {
      const group = (await call(salesA, 'post', '/messaging/conversations', { kind: 'GROUP', name: 'Bahsetme grubu', memberIds: [salesB.id] }).expect(201)).body;
      assert.match((await post(salesA, group.id, '@tech bakar mısın', { mentionIds: [tech.id] }).expect(409)).body.error.message, /tech bu konuşmanın üyesi değil/);
      const company = (await call(salesA, 'post', '/companies', { displayName: 'P8L Firma', legalName: 'P8L Firma AŞ' }).expect(201)).body;
      const record = (await call(salesA, 'post', '/messaging/record-conversations', { recordType: 'COMPANY', recordId: company.id }).expect(201)).body;
      assert.match((await post(salesA, record.id, '@sales-b fiyatı gör', { mentionIds: [salesB.id] }).expect(409)).body.error.message, /sales-b bu kaydı göremiyor\. Bahsetmek erişim vermez/);
      assert.equal(await db.message.count({ where: { conversationId: record.id } }), 0);
      await call(salesB, 'get', `/messaging/conversations/${record.id}`).expect(404);
      const ok = (await post(salesA, group.id, '@sales-b ve kendim', { mentionIds: [salesB.id, salesA.id] }).expect(201)).body;
      assert.deepEqual(ok.mentions, [{ id: salesB.id, name: 'sales-b' }]);
      await assert.rejects(db.messageMention.deleteMany({ where: { messageId: ok.id } }));
      await post(salesA, group.id, 'x', { mentionIds: [randomUUID()] }).expect(400);
    });

    await t.test('notifications: mention beats direct beats reply; channel chatter notifies nobody; retries do not duplicate', async () => {
      const before = await db.notification.count();
      const genel = (await call(salesA, 'get', '/messaging/conversations?kind=CHANNEL').expect(200)).body.items.find((c: { name: string }) => c.name === 'genel');
      for (const s of [salesA, salesB]) await call(s, 'post', `/messaging/conversations/${genel.id}/join`).expect(201);
      await post(salesA, genel.id, 'Herkese günaydın').expect(201);
      assert.equal(await db.notification.count(), before);
      const mention = (await post(salesA, genel.id, '@tech kurulum bugün mü?', { mentionIds: [tech.id] }).expect(201)).body;
      assert.deepEqual(await db.notification.findMany({ where: { messageId: mention.id }, select: { userId: true, type: true } }), [{ userId: tech.id, type: 'MESSAGE_MENTION' }]);

      const dm = (await call(salesA, 'post', '/messaging/direct', { userId: salesB.id }).expect(201)).body;
      const key = nonce();
      const direct = (await call(salesA, 'post', `/messaging/conversations/${dm.id}/messages`, { body: '@sales-b teklif hazır', clientNonce: key, mentionIds: [salesB.id] }).expect(201)).body;
      await call(salesA, 'post', `/messaging/conversations/${dm.id}/messages`, { body: '@sales-b teklif hazır', clientNonce: key, mentionIds: [salesB.id] }).expect(201);
      await call(salesA, 'post', `/messaging/conversations/${dm.id}/messages`, { body: '@sales-b teklif hazır', clientNonce: key, mentionIds: [] }).expect(409);
      assert.deepEqual(await db.notification.findMany({ where: { messageId: direct.id }, select: { userId: true, type: true } }), [{ userId: salesB.id, type: 'MESSAGE_MENTION' }]);
      const plain = (await post(salesB, dm.id, 'Teşekkürler').expect(201)).body;
      assert.deepEqual(await db.notification.findMany({ where: { messageId: plain.id }, select: { userId: true, type: true } }), [{ userId: salesA.id, type: 'MESSAGE_DIRECT' }]);

      const group = (await call(salesA, 'post', '/messaging/conversations', { kind: 'GROUP', name: 'Yanıt grubu', memberIds: [salesB.id, tech.id] }).expect(201)).body;
      const parent = (await post(salesA, group.id, 'Kurulum planı').expect(201)).body;
      const reply = (await post(salesB, group.id, 'Pazartesi uygun', { parentId: parent.id }).expect(201)).body;
      assert.deepEqual(await db.notification.findMany({ where: { messageId: reply.id }, select: { userId: true, type: true } }), [{ userId: salesA.id, type: 'MESSAGE_REPLY' }]);
      const second = (await post(salesA, group.id, 'Tamam', { parentId: parent.id }).expect(201)).body;
      assert.deepEqual(await db.notification.findMany({ where: { messageId: second.id }, select: { userId: true, type: true } }), [{ userId: salesB.id, type: 'MESSAGE_REPLY' }]);

      const list = (await call(tech, 'get', '/notifications').expect(200)).body;
      const item = list.find((n: { messageId: string }) => n.messageId === mention.id);
      assert.deepEqual(item.message, { conversationId: genel.id, conversation: '#genel', author: 'sales-a', parentId: null });
      assert.doesNotMatch(JSON.stringify(list), /kurulum bugün/);
      await call(tech, 'post', `/notifications/${item.id}/read`).expect(201);
    });

    await t.test('message notifications disappear when access to the record is revoked', async () => {
      const company = (await call(salesA, 'post', '/companies', { displayName: 'P8L Paylaşım', legalName: 'P8L Paylaşım AŞ' }).expect(201)).body;
      await call(salesA, 'post', `/companies/${company.id}/shares`, { userId: salesB.id, permission: 'READ' }).expect(201);
      const record = (await call(salesA, 'post', '/messaging/record-conversations', { recordType: 'COMPANY', recordId: company.id }).expect(201)).body;
      const message = (await post(salesA, record.id, '@sales-b sözleşmeye bak', { mentionIds: [salesB.id] }).expect(201)).body;
      const notification = await db.notification.findFirstOrThrow({ where: { messageId: message.id, userId: salesB.id } });
      assert.ok((await call(salesB, 'get', '/notifications').expect(200)).body.some((n: { id: string }) => n.id === notification.id));
      await call(salesA, 'post', `/companies/${company.id}/shares`, { userId: salesB.id, permission: 'NONE' }).expect(201);
      assert.ok(!(await call(salesB, 'get', '/notifications').expect(200)).body.some((n: { id: string }) => n.id === notification.id));
      await call(salesB, 'post', `/notifications/${notification.id}/read`).expect(404);
    });

    await t.test('live stream: members get identifier-only events, outsiders get nothing, revocation applies immediately', async () => {
      assert.equal((await open()).status, 401);
      const [a, b, outsider] = await Promise.all([open(salesA), open(salesB), open(tech)]);
      assert.match(String(a.headers?.['content-type']), /^text\/event-stream/); assert.match(String(a.headers?.['cache-control']), /no-transform/);
      const dm = (await call(salesA, 'post', '/messaging/direct', { userId: salesB.id }).expect(201)).body;
      const sent = (await post(salesB, dm.id, 'Canlı mesaj içeriği').expect(201)).body;
      await until(() => got(a, 'message', dm.id) > 0 && got(a, 'notification') > 0);
      const event = a.events.find(e => e.event === 'message' && e.data.conversationId === dm.id)!;
      assert.deepEqual(event.data, { conversationId: dm.id, seq: sent.seq });
      assert.doesNotMatch(JSON.stringify(a.events), /Canlı mesaj/);
      await until(() => got(b, 'message', dm.id) > 0);
      await sleep(300);
      assert.equal(got(outsider, 'message', dm.id), 0); assert.equal(got(outsider, 'notification'), 0);

      const company = (await call(salesA, 'post', '/companies', { displayName: 'P8L Canlı', legalName: 'P8L Canlı AŞ' }).expect(201)).body;
      await call(salesA, 'post', `/companies/${company.id}/shares`, { userId: salesB.id, permission: 'READ' }).expect(201);
      const record = (await call(salesA, 'post', '/messaging/record-conversations', { recordType: 'COMPANY', recordId: company.id }).expect(201)).body;
      await post(salesA, record.id, 'Paylaşım varken').expect(201);
      await until(() => got(b, 'message', record.id) === 1);
      await call(salesA, 'post', `/companies/${company.id}/shares`, { userId: salesB.id, permission: 'NONE' }).expect(201);
      await post(salesA, record.id, 'Paylaşım kalktıktan sonra').expect(201);
      await until(() => got(a, 'message', record.id) === 2);
      await sleep(300);
      assert.equal(got(b, 'message', record.id), 1);

      // A scan verdict on a sent file is signalled so open conversations refresh the file state.
      const file = await request(app.getHttpServer()).post(`/api/v1/messaging/conversations/${dm.id}/attachments?name=not.txt`).set('Cookie', salesA.cookie).set('Origin', origin).set('X-CSRF-Token', salesA.csrf).set('Content-Type', 'application/octet-stream').send(Buffer.from('not')).expect(201);
      await call(salesA, 'post', `/messaging/conversations/${dm.id}/messages`, { body: '', clientNonce: nonce(), attachmentIds: [file.body.id] }).expect(201);
      await db.messageAttachment.update({ where: { id: file.body.id }, data: { scanStatus: 'CLEAN', scannedAt: new Date() } });
      await until(() => got(b, 'attachment', dm.id) === 1);
    });

    await t.test('streams close when the session ends or the user is deactivated; per-user connection limit', async () => {
      const [b, outsider] = await Promise.all([open(salesB), open(tech)]);
      await call(salesB, 'post', '/auth/logout').expect(201);
      await until(() => b.ended);
      await call(admin, 'patch', `/users/${tech.id}`, { isActive: false }).expect(200);
      await until(() => outsider.ended);
      const many = await Promise.all([1, 2, 3, 4, 5].map(() => open(viewer)));
      assert.ok(many.every(s => s.status === 200));
      assert.equal((await open(viewer)).status, 429);
      many[0]!.close(); await sleep(100);
      assert.equal((await open(viewer)).status, 200);
    });
  } finally {
    for (const s of streams) s.close();
    await db.rateLimit.deleteMany({});
    await app.close();
  }
});
