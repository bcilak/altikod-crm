import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
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

const base = { NODE_ENV: 'production', APP_ORIGIN: 'https://crm.example.invalid', DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };
const smtp = { MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.example.invalid', MAIL_FROM: 'Altıkod CRM <crm@example.invalid>', SMTP_USER: 'crm', SMTP_PASSWORD: 'Secret-smtp-value-1' };
const rejects = (env: NodeJS.ProcessEnv, field: string) => assert.throws(() => parseEnv(env), (error: Error) => error.message.includes(field) && !error.message.includes('Secret-smtp-value-1'));

test('production mail configuration is validated without leaking secrets', () => {
  rejects({ ...base }, 'MAIL_TRANSPORT');
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
