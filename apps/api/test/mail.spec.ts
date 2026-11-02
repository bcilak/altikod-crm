import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SMTPServer } from 'smtp-server';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { hashPassword } from '../src/auth/auth.service';
import { authMail } from '../src/auth/mailer';
import { parseEnv } from '../src/env';
import { configureApp } from '../src/http';

const vapid = webpush.generateVAPIDKeys();
const base = { NODE_ENV: 'production', APP_ORIGIN: 'https://crm.example.invalid', DATABASE_URL: 'postgresql://u:p@localhost:5432/db', MALWARE_SCANNER: 'clamd', CLAMD_HOST: 'clamav', WEB_PUSH_PUBLIC_KEY: vapid.publicKey, WEB_PUSH_PRIVATE_KEY: vapid.privateKey, WEB_PUSH_SUBJECT: 'mailto:crm@example.invalid' };
const smtp = { MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.example.invalid', MAIL_FROM: 'Altıkod CRM <crm@example.invalid>', SMTP_USER: 'crm', SMTP_PASSWORD: 'Secret-smtp-value-1' };
const rejects = (env: NodeJS.ProcessEnv, field: string) => assert.throws(() => parseEnv(env), (error: Error) => error.message.includes(field) && !error.message.includes('Secret-smtp-value-1'));

test('production mail configuration is validated without leaking secrets', () => {
  rejects({ ...base }, 'MAIL_TRANSPORT');
  assert.equal(parseEnv({ ...base, MAIL_TRANSPORT: 'disabled' }).MAIL_TRANSPORT, 'disabled');
  rejects({ ...base, ...smtp, SMTP_HOST: undefined }, 'SMTP_HOST');
  rejects({ ...base, ...smtp, MAIL_FROM: undefined }, 'MAIL_FROM');
  rejects({ ...base, ...smtp, SMTP_USER: undefined }, 'SMTP_PASSWORD');
  rejects({ ...base, ...smtp, SMTP_SECURITY: 'none' }, 'SMTP_SECURITY');
  assert.equal(parseEnv({ ...base, ...smtp }).SMTP_SECURITY, 'starttls');
  assert.equal(parseEnv({ ...base, ...smtp, SMTP_USER: '', SMTP_PASSWORD: '' }).SMTP_USER, undefined);
  rejects({ ...base, ...smtp, SMTP_HOST: '' }, 'SMTP_HOST');
  assert.equal(parseEnv({ ...base, ...smtp, SMTP_SECURITY: 'tls', SMTP_PORT: '465' }).SMTP_PORT, 465);
  assert.equal(parseEnv({ NODE_ENV: 'development', DATABASE_URL: base.DATABASE_URL }).MAIL_TRANSPORT, 'local');
  const html = authMail('INVITE', 'https://crm.example.invalid/accept-invite#token="><script>').html;
  assert.ok(!html.includes('"><script>') && html.includes('&quot;&gt;&lt;script&gt;'));
});

test('disabled mail rejects requests before creating users or tokens without disclosing accounts', async () => {
  if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.startsWith('/saleshub_test_')) throw new Error('Isolated database required');
  const previous = process.env.MAIL_TRANSPORT;
  process.env.MAIL_TRANSPORT = 'disabled';
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication(); configureApp(app); await app.init();
  const db = app.get(PrismaService);
  try {
    const password = 'Test-only-password!42';
    await db.user.create({ data: { name: 'No Mail Admin', email: 'no-mail-admin@example.invalid', role: 'ADMIN', passwordHash: await hashPassword(password) } });
    const post = (path: string, body: object) => request(app.getHttpServer()).post(`/api/v1${path}`).set('Origin', 'http://localhost:3000').send(body);
    const login = await post('/auth/login', { email: 'no-mail-admin@example.invalid', password }).expect(201);
    const tokens = await db.authToken.count();
    const users = await db.user.count();
    const existing = await post('/auth/password-reset/request', { email: 'no-mail-admin@example.invalid' }).expect(503);
    const missing = await post('/auth/password-reset/request', { email: 'missing-no-mail@example.invalid' }).expect(503);
    assert.equal(existing.body.error.message, missing.body.error.message);
    assert.match(existing.body.error.message, /kapalı/);
    await request(app.getHttpServer()).post('/api/v1/users/invitations')
      .set('Origin', 'http://localhost:3000').set('Cookie', (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!)
      .set('X-CSRF-Token', login.body.csrfToken).send({ email: 'no-mail-invite@example.invalid', name: 'No Mail', role: 'SALES' }).expect(503);
    assert.equal(await db.authToken.count(), tokens);
    assert.equal(await db.user.count(), users);
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.MAIL_TRANSPORT; else process.env.MAIL_TRANSPORT = previous;
  }
});

test('SMTP adapter delivers invitation and reset links through a real SMTP session', async t => {
  if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.startsWith('/saleshub_test_')) throw new Error('Isolated database required');
  const inbox: { from: string; to: string[]; data: string }[] = []; let fail = false;
  const server = new SMTPServer({
    secure: false, disabledCommands: ['STARTTLS'], authOptional: false, logger: false,
    onAuth: (auth, _session, done) => auth.username === 'crm' && auth.password === 'Smtp-test-password-1' ? done(null, { user: 'crm' }) : done(new Error('Invalid credentials')),
    onData: (stream, session, done) => {
      const chunks: Buffer[] = []; stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => {
        if (fail) return done(new Error('Mailbox unavailable'));
        inbox.push({ from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '', to: session.envelope.rcptTo.map(r => r.address), data: Buffer.concat(chunks).toString('utf8') }); done();
      });
    },
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const previous = { ...process.env };
  Object.assign(process.env, { NODE_ENV: 'test', MAIL_TRANSPORT: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String((server.server.address() as AddressInfo).port), SMTP_SECURITY: 'none', SMTP_USER: 'crm', SMTP_PASSWORD: 'Smtp-test-password-1', MAIL_FROM: 'Altıkod CRM <crm@example.invalid>', DATABASE_URL: process.env.TEST_DATABASE_URL });
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication(); configureApp(app); await app.init(); const db = app.get(PrismaService);
  const anon = (path: string, body: object) => request(app.getHttpServer()).post(`/api/v1${path}`).set('Origin', 'http://localhost:3000').send(body);
  const decoded = (data: string) => data.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  const token = (data: string, path: string) => decoded(data).match(new RegExp(`${path}#token=([a-f0-9]{64})`))?.[1];
  try {
    const password = 'Test-only-password!42';
    await db.user.create({ data: { name: 'Mail Admin', email: 'mail-admin@example.invalid', role: 'ADMIN', passwordHash: await hashPassword(password) } });
    const login = await anon('/auth/login', { email: 'mail-admin@example.invalid', password }).expect(201);
    const admin = { cookie: (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!, csrf: login.body.csrfToken as string };
    const invite = (email: string) => request(app.getHttpServer()).post('/api/v1/users/invitations').set('Cookie', admin.cookie).set('Origin', 'http://localhost:3000').set('X-CSRF-Token', admin.csrf).send({ email, name: 'Mail User', role: 'SALES' });

    await t.test('invitation is sent over authenticated SMTP and its link activates the account', async () => {
      const response = await invite('mail-user@example.invalid').expect(201);
      assert.equal(response.body.delivery, 'SMTP');
      assert.equal(inbox.length, 1);
      const mail = inbox[0]!;
      assert.equal(mail.from, 'crm@example.invalid'); assert.deepEqual(mail.to, ['mail-user@example.invalid']);
      assert.match(mail.data, /Subject: =\?UTF-8\?/); assert.match(mail.data, /multipart\/alternative/);
      const raw = token(mail.data, 'accept-invite'); assert.ok(raw, 'invite link missing');
      await anon('/auth/invitation/accept', { token: raw, password }).expect(201);
      await anon('/auth/login', { email: 'mail-user@example.invalid', password }).expect(201);
    });

    await t.test('reset mail reaches active users; failed delivery does not reveal account existence', async () => {
      const ok = await anon('/auth/password-reset/request', { email: 'mail-user@example.invalid' }).expect(201);
      assert.equal(inbox.length, 2); assert.ok(token(inbox[1]!.data, 'reset-password'));
      fail = true;
      const existing = await anon('/auth/password-reset/request', { email: 'mail-user@example.invalid' }).expect(201);
      const missing = await anon('/auth/password-reset/request', { email: 'nobody@example.invalid' }).expect(201);
      assert.deepEqual(existing.body, missing.body); assert.deepEqual(existing.body, ok.body);
      assert.equal(inbox.length, 2);
    });

    await t.test('failed invitation delivery is reported to the administrator', async () => {
      const response = await invite('mail-later@example.invalid').expect(503);
      assert.match(response.body.error.message, /Davet e-postası gönderilemedi/);
      assert.doesNotMatch(JSON.stringify(response.body), /token=|Mailbox unavailable/i);
      fail = false;
      await invite('mail-later@example.invalid').expect(201);
      assert.equal(inbox.length, 3);
    });
  } finally {
    await app.close(); await new Promise<void>(resolve => server.close(() => resolve()));
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

test('managed passwords: restricted login, change, reset, revocation and admin-only access', async () => {
  if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.startsWith('/saleshub_test_')) throw new Error('Isolated database required');
  const previous = process.env.MAIL_TRANSPORT; process.env.MAIL_TRANSPORT = 'disabled';
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication(); configureApp(app); await app.init(); const db = app.get(PrismaService);
  const temp = 'Temporary-test!123'; const permanent = 'Permanent-test!456'; const reset = 'Reset-test-only!789';
  const post = (path: string, data: object, auth?: { cookie: string; csrf: string }) => {
    const r = request(app.getHttpServer()).post(`/api/v1${path}`).set('Origin', 'http://localhost:3000');
    if (auth) r.set('Cookie', auth.cookie).set('X-CSRF-Token', auth.csrf);
    return r.send(data);
  };
  const login = async (email: string, password: string) => {
    const r = await post('/auth/login', { email, password }).expect(201);
    return { cookie: (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!, csrf: r.body.csrfToken as string };
  };
  try {
    const owner = await db.user.create({ data: { email: 'managed-admin@example.invalid', name: 'Managed Admin', role: 'ADMIN', passwordHash: await hashPassword(permanent) } });
    const admin = await login(owner.email, permanent);
    const input = { email: 'managed-user@example.invalid', name: 'Managed User', role: 'SALES', temporaryPassword: temp };
    await post('/users', { ...input, temporaryPassword: 'short' }, admin).expect(400);
    const created = await post('/users', input, admin).expect(201); const id = created.body.id;
    assert.equal(created.body.mustChangePassword, true); assert.ok(!JSON.stringify(created.body).includes(temp)); assert.ok(!('passwordHash' in created.body));
    await post('/users', input, admin).expect(409);
    let user = await login(input.email, temp);
    await request(app.getHttpServer()).get('/api/v1/companies').set('Cookie', user.cookie).expect(403);
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', user.cookie).expect(200);
    assert.equal(me.body.mustChangePassword, true);
    await post('/auth/password/change', { currentPassword: temp, password: permanent }, { ...user, csrf: 'wrong' }).expect(403);
    await post('/auth/password/change', { currentPassword: 'wrong', password: permanent }, user).expect(400);
    await post('/auth/password/change', { currentPassword: temp, password: temp }, user).expect(400);
    await post('/auth/password/change', { currentPassword: temp, password: permanent }, user).expect(201);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', user.cookie).expect(401);
    user = await login(input.email, permanent);
    await request(app.getHttpServer()).get('/api/v1/companies').set('Cookie', user.cookie).expect(200);
    await post('/users', { ...input, email: 'unauthorized@example.invalid' }, user).expect(403);
    await post(`/users/${owner.id}/password`, { temporaryPassword: reset }, user).expect(403);
    await post(`/users/${owner.id}/password`, { temporaryPassword: reset }, admin).expect(400);
    const token = await db.authToken.create({ data: { userId: id, kind: 'RESET', tokenHash: 'managed-token-hash', expiresAt: new Date(Date.now() + 60000) } });
    await post(`/users/${id}/password`, { temporaryPassword: reset }, admin).expect(201);
    assert.ok((await db.authToken.findUniqueOrThrow({ where: { id: token.id } })).usedAt);
    assert.equal(await db.pushSubscription.count({ where: { userId: id } }), 0);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', user.cookie).expect(401);
    await post('/auth/login', { email: input.email, password: permanent }).expect(401);
    user = await login(input.email, reset);
    await request(app.getHttpServer()).get('/api/v1/companies').set('Cookie', user.cookie).expect(403);
    await post('/auth/password/change', { currentPassword: reset, password: permanent }, user).expect(201);
    const logs = await db.auditLog.findMany({ where: { entityId: id } });
    assert.ok(logs.some(l => l.action === 'ADMIN_PASSWORD_RESET')); assert.ok(logs.some(l => l.action === 'USER_CREATE'));
    for (const secret of [temp, reset, permanent]) assert.ok(!JSON.stringify(logs).includes(secret));
  } finally {
    // This file shares an isolated DB with later suites; do not spend their login rate-limit budget.
    await db.rateLimit.deleteMany();
    await app.close(); if (previous === undefined) delete process.env.MAIL_TRANSPORT; else process.env.MAIL_TRANSPORT = previous;
  }
});
