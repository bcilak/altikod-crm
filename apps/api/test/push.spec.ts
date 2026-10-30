import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import webpush from 'web-push';
// http_ece ships with web-push and implements the browser side of RFC 8291 decryption.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ece = require('http_ece') as { decrypt: (body: Buffer, params: object) => Buffer };
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { hashPassword } from '../src/auth/auth.service';
import { configureApp } from '../src/http';
import { Role } from '../src/generated/prisma/client';
import { PushService, deviceLabel } from '../src/push/push.service';
import { OutboxService } from '../src/crm/outbox.service';
import { parseEnv } from '../src/env';

type Session = { cookie: string; csrf: string; id: string };
type Received = { path: string; headers: IncomingHttpHeaders; body: Buffer };
const origin = 'http://localhost:3000';
const nonce = () => randomBytes(12).toString('hex');
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
async function until(condition: () => boolean, ms = 4000) {
  const start = Date.now();
  while (!condition()) { if (Date.now() - start > ms) throw new Error('Timed out waiting for push'); await sleep(20); }
}

test('production refuses to start without Web Push keys; device labels', () => {
  const base = { NODE_ENV: 'production', APP_ORIGIN: 'https://crm.example.invalid', DATABASE_URL: 'postgresql://u:p@localhost:5432/db', MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.example.invalid', MAIL_FROM: 'CRM <crm@example.invalid>', MALWARE_SCANNER: 'clamd', CLAMD_HOST: 'clamav' };
  const keys = webpush.generateVAPIDKeys();
  assert.throws(() => parseEnv(base), /WEB_PUSH_PUBLIC_KEY/);
  assert.throws(() => parseEnv({ ...base, WEB_PUSH_PUBLIC_KEY: keys.publicKey }), /WEB_PUSH_PRIVATE_KEY/);
  const full = { ...base, WEB_PUSH_PUBLIC_KEY: keys.publicKey, WEB_PUSH_PRIVATE_KEY: keys.privateKey, WEB_PUSH_SUBJECT: 'mailto:crm@example.invalid' };
  assert.equal(parseEnv(full).WEB_PUSH_SUBJECT, 'mailto:crm@example.invalid');
  assert.throws(() => parseEnv({ ...full, WEB_PUSH_TEST_ORIGIN: 'http://127.0.0.1:1' }), /WEB_PUSH_TEST_ORIGIN/);
  assert.equal(deviceLabel(iphone), 'iPhone · Safari');
  assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'), 'Android · Chrome');
});

test('Faz 9: phone notifications (Web Push) and message reactions', async t => {
  if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.startsWith('/saleshub_test_')) throw new Error('Isolated database required');
  // A local stand-in for Apple/Google push services: records encrypted deliveries, answers 410 for “gone” devices.
  const received: Received[] = [];
  const fake = createServer((req, res) => {
    const chunks: Buffer[] = []; req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => { received.push({ path: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) }); res.statusCode = req.url?.startsWith('/gone') ? 410 : 201; res.end(); });
  });
  await new Promise<void>(done => fake.listen(0, '127.0.0.1', () => done()));
  const fakeOrigin = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  const vapid = webpush.generateVAPIDKeys();
  Object.assign(process.env, { DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: 'test', WEB_PUSH_PUBLIC_KEY: vapid.publicKey, WEB_PUSH_PRIVATE_KEY: vapid.privateKey, WEB_PUSH_SUBJECT: 'mailto:crm@example.invalid', WEB_PUSH_TEST_ORIGIN: fakeOrigin });
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication(); configureApp(app); await app.init(); const db = app.get(PrismaService); const push = app.get(PushService);
  const call = (s: Session, method: 'get' | 'post' | 'patch', path: string, body?: object) => {
    const r = request(app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', s.cookie).set('Origin', origin).set('X-CSRF-Token', s.csrf).set('User-Agent', iphone); return body ? r.send(body) : r;
  };
  const post = (s: Session, conversationId: string, body: string, extra: object = {}) => call(s, 'post', `/messaging/conversations/${conversationId}/messages`, { body, clientNonce: nonce(), ...extra });
  const login = async (role: Role, name: string): Promise<Session> => {
    const email = `p9-${name}@example.invalid`; const password = 'Test-only-password!42';
    await db.user.create({ data: { name, email, role, passwordHash: await hashPassword(password) } });
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', origin).send({ email, password }).expect(201);
    return { cookie: (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!, csrf: r.body.csrfToken, id: r.body.user.id };
  };
  /** What a browser does: a P-256 key pair and auth secret, and decryption of what arrives. */
  const device = (path: string) => {
    const ecdh = createECDH('prime256v1'); ecdh.generateKeys(); const auth = randomBytes(16);
    return { json: { endpoint: `${fakeOrigin}${path}`, expirationTime: null, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } },
      open: (r: Received) => JSON.parse(ece.decrypt(r.body, { version: 'aes128gcm', privateKey: ecdh, authSecret: auth }).toString()) as { title: string; body: string; url: string; tag: string; badge: number } };
  };
  const at = (path: string) => received.filter(r => r.path === path);
  try {
    const admin = await login('ADMIN', 'admin'); const salesA = await login('SALES', 'sales-a'); const salesB = await login('SALES', 'sales-b'); const viewer = await login('VIEWER', 'viewer');

    await t.test('subscriptions: only real push services, device label, one owner per endpoint, at most 10 devices', async () => {
      const status = (await call(salesB, 'get', '/push/devices').expect(200)).body;
      assert.equal(status.enabled, true); assert.equal(status.publicKey, vapid.publicKey); assert.deepEqual(status.devices, []);
      const phone = device('/b-phone');
      for (const endpoint of ['https://evil.example.com/push', 'http://169.254.169.254/latest', 'https://fcm.googleapis.com:8443/x']) await call(salesB, 'post', '/push/subscriptions', { ...phone.json, endpoint }).expect(400);
      const row = (await call(salesB, 'post', '/push/subscriptions', phone.json).expect(201)).body;
      assert.equal(row.label, 'iPhone · Safari'); assert.equal(row.current, true); assert.equal(row.showPreview, false);
      const shared = device('/shared');
      await call(salesA, 'post', '/push/subscriptions', shared.json).expect(201);
      await call(salesA, 'patch', `/push/devices/${(await db.pushSubscription.findUniqueOrThrow({ where: { endpoint: shared.json.endpoint } })).id}`, { showPreview: true }).expect(200);
      await call(viewer, 'post', '/push/subscriptions', shared.json).expect(201);
      const moved = await db.pushSubscription.findUniqueOrThrow({ where: { endpoint: shared.json.endpoint } });
      assert.equal(moved.userId, viewer.id); assert.equal(moved.showPreview, false);
      for (let i = 0; i < 11; i++) await call(admin, 'post', '/push/subscriptions', device(`/admin-${i}`).json).expect(201);
      assert.equal(await db.pushSubscription.count({ where: { userId: admin.id } }), 10);
      await call(salesA, 'post', `/push/devices/${row.id}/remove`).expect(404);
    });

    await t.test('a direct message reaches the phone instantly, encrypted, without content unless previews are on', async () => {
      const dm = (await call(salesA, 'post', '/messaging/direct', { userId: salesB.id }).expect(201)).body;
      const phone = device('/b-phone');
      await call(salesB, 'post', '/push/subscriptions', phone.json).expect(201);
      await post(salesA, dm.id, 'Fiyat 1.250.000 TL, müşteri onayladı').expect(201);
      await until(() => at('/b-phone').length === 1);
      const delivery = at('/b-phone')[0]!;
      assert.match(String(delivery.headers.authorization), /^vapid t=.+, k=/); assert.equal(delivery.headers['content-encoding'], 'aes128gcm'); assert.equal(delivery.headers.urgency, 'high');
      assert.doesNotMatch(delivery.body.toString('latin1'), /Fiyat|1\.250/);
      const payload = phone.open(delivery);
      assert.deepEqual({ ...payload, badge: undefined }, { title: 'Altıkod CRM', body: 'Yeni birebir mesaj · sales-a', url: `/messages?c=${dm.id}`, tag: `conversation-${dm.id}`, badge: undefined });
      assert.ok(payload.badge >= 1);
      const id = (await db.pushSubscription.findUniqueOrThrow({ where: { endpoint: phone.json.endpoint } })).id;
      await call(salesB, 'patch', `/push/devices/${id}`, { showPreview: true }).expect(200);
      await post(salesA, dm.id, 'Yarın 10:00 toplantı').expect(201);
      await until(() => at('/b-phone').length === 2);
      assert.deepEqual([phone.open(at('/b-phone')[1]!).title, phone.open(at('/b-phone')[1]!).body], ['sales-a', 'Yarın 10:00 toplantı']);
      // Exactly once: the claim is final, the sweep finds nothing, a second delivery attempt is a no-op.
      const notification = await db.notification.findFirstOrThrow({ where: { userId: salesB.id }, orderBy: { createdAt: 'desc' } });
      assert.ok(notification.pushClaimedAt);
      assert.equal(await push.deliver(notification.id), false); await push.sweep();
      await sleep(200); assert.equal(at('/b-phone').length, 2);
      assert.ok((await db.pushSubscription.findUniqueOrThrow({ where: { id } })).lastSuccessAt);
    });

    await t.test('content follows current access; inactive users and channel chatter get nothing', async () => {
      const before = received.length;
      const genel = (await call(salesA, 'get', '/messaging/conversations?kind=CHANNEL').expect(200)).body.items.find((c: { name: string }) => c.name === 'genel');
      for (const s of [salesA, salesB]) await call(s, 'post', `/messaging/conversations/${genel.id}/join`).expect(201);
      await post(salesA, genel.id, 'Herkese günaydın').expect(201);
      const company = (await call(salesA, 'post', '/companies', { displayName: 'P9 Firma', legalName: 'P9 Firma AŞ' }).expect(201)).body;
      await call(salesA, 'post', `/companies/${company.id}/shares`, { userId: salesB.id, permission: 'READ' }).expect(201);
      const record = (await call(salesA, 'post', '/messaging/record-conversations', { recordType: 'COMPANY', recordId: company.id }).expect(201)).body;
      const message = (await post(salesA, record.id, 'Kayıt mesajı').expect(201)).body;
      await call(salesA, 'post', `/companies/${company.id}/shares`, { userId: salesB.id, permission: 'NONE' }).expect(201);
      // A notification about something the reader can no longer see is not pushed.
      const late = await db.notification.create({ data: { userId: salesB.id, messageId: message.id, type: 'MESSAGE_MENTION', dedupeKey: `test:${nonce()}` } });
      await sleep(400);
      assert.equal(received.length, before);
      assert.ok((await db.notification.findUniqueOrThrow({ where: { id: late.id } })).pushClaimedAt);
      await call(admin, 'patch', `/users/${viewer.id}`, { isActive: false }).expect(200);
      assert.equal(await db.pushSubscription.count({ where: { userId: viewer.id } }), 0);
    });

    await t.test('task notifications are pushed too; the 8-hour session ending does not silence the phone', async () => {
      const company = (await call(salesA, 'post', '/companies', { displayName: 'P9 Görev', legalName: 'P9 Görev AŞ' }).expect(201)).body;
      await call(salesA, 'post', `/companies/${company.id}/shares`, { userId: salesB.id, permission: 'WRITE' }).expect(201);
      await db.session.updateMany({ where: { userId: salesB.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const before = at('/b-phone').length;
      await call(salesA, 'post', '/tasks', { companyId: company.id, assigneeId: salesB.id, title: 'Sözleşmeyi gönder', dueAt: '2030-01-01T09:00:00Z' }).expect(201);
      await app.get(OutboxService).tick();
      await until(() => at('/b-phone').length === before + 1);
      const sub = await db.pushSubscription.findUniqueOrThrow({ where: { endpoint: `${fakeOrigin}/b-phone` } });
      assert.ok(sub.showPreview);
      const delivery = at('/b-phone').at(-1)!;
      assert.equal(delivery.headers['content-encoding'], 'aes128gcm');
    });

    await t.test('gone devices are removed; signing out of a device removes its subscription; test notification', async () => {
      const gone = device('/gone-1');
      await call(salesA, 'post', '/push/subscriptions', gone.json).expect(201);
      assert.deepEqual((await call(salesA, 'post', '/push/test').expect(201)).body, { sent: 0, failed: 1 });
      assert.equal(await db.pushSubscription.count({ where: { endpoint: gone.json.endpoint } }), 0);
      const laptop = device('/a-laptop');
      await call(salesA, 'post', '/push/subscriptions', laptop.json).expect(201);
      assert.deepEqual((await call(salesA, 'post', '/push/test').expect(201)).body, { sent: 1, failed: 0 });
      assert.equal(laptop.open(at('/a-laptop')[0]!).body, 'Test bildirimi: bu cihaz bildirim alıyor.');
      await call(salesA, 'post', '/auth/logout').expect(201);
      assert.equal(await db.pushSubscription.count({ where: { endpoint: laptop.json.endpoint } }), 0);
    });

    await t.test('reactions: fixed set, toggle, counts with names, writers only, never on removed messages', async () => {
      const a = await login('SALES', 'sales-a2'); const b = await login('SALES', 'sales-b2'); const v = await login('VIEWER', 'viewer2'); const outsider = await login('SALES', 'outsider');
      const group = (await call(a, 'post', '/messaging/conversations', { kind: 'GROUP', name: 'Tepki grubu', memberIds: [b.id] }).expect(201)).body;
      const m = (await post(a, group.id, 'Teklif gönderildi').expect(201)).body;
      assert.deepEqual(m.reactions, []);
      const notified = await db.notification.count();
      await call(a, 'post', `/messaging/messages/${m.id}/reactions`, { emoji: '💩' }).expect(400);
      await call(b, 'post', `/messaging/messages/${m.id}/reactions`, { emoji: '👍' }).expect(201);
      await call(b, 'post', `/messaging/messages/${m.id}/reactions`, { emoji: '✅' }).expect(201);
      const both = (await call(a, 'post', `/messaging/messages/${m.id}/reactions`, { emoji: '👍' }).expect(201)).body;
      assert.deepEqual(both.reactions, [{ emoji: '👍', count: 2, mine: true, names: ['sales-b2', 'sales-a2'] }, { emoji: '✅', count: 1, mine: false, names: ['sales-b2'] }]);
      const toggled = (await call(b, 'post', `/messaging/messages/${m.id}/reactions`, { emoji: '👍' }).expect(201)).body;
      assert.equal(await db.notification.count(), notified, 'reactions never notify');
      assert.deepEqual(toggled.reactions.map((r: { emoji: string; count: number; mine: boolean }) => [r.emoji, r.count, r.mine]), [['👍', 1, false], ['✅', 1, true]]);
      assert.deepEqual((await call(b, 'get', `/messaging/conversations/${group.id}/messages`).expect(200)).body.items[0].reactions.map((r: { emoji: string }) => r.emoji), ['👍', '✅']);
      await call(outsider, 'post', `/messaging/messages/${m.id}/reactions`, { emoji: '👍' }).expect(404);
      const genel = (await call(v, 'get', '/messaging/conversations?kind=CHANNEL').expect(200)).body.items.find((c: { name: string }) => c.name === 'genel');
      await call(v, 'post', `/messaging/conversations/${genel.id}/join`).expect(201); await call(a, 'post', `/messaging/conversations/${genel.id}/join`).expect(201);
      const announcement = (await post(a, genel.id, 'Duyuru').expect(201)).body;
      await call(v, 'post', `/messaging/messages/${announcement.id}/reactions`, { emoji: '👀' }).expect(403);
      await call(a, 'post', `/messaging/messages/${m.id}/delete`).expect(201);
      await call(b, 'post', `/messaging/messages/${m.id}/reactions`, { emoji: '❤️' }).expect(409);
      assert.deepEqual((await call(b, 'get', `/messaging/conversations/${group.id}/messages`).expect(200)).body.items[0].reactions, []);
    });
  } finally {
    await db.rateLimit.deleteMany({});
    await app.close(); fake.close();
  }
});
