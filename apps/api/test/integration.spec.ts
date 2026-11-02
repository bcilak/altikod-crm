import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { Mailer } from '../src/auth/mailer';
import { hashPassword } from '../src/auth/auth.service';
import { configureApp } from '../src/http';
import { OutboxService } from '../src/crm/outbox.service';
import { Role } from '../src/generated/prisma/client';

type Session = { cookie: string; csrf: string; id: string };
test('Phases 1–3: real PostgreSQL security and business workflows', async t => {
  if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.startsWith('/saleshub_test_')) throw new Error('Isolated test database required');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; process.env.NODE_ENV = 'test';
  const mailbox: { email: string; kind: string; url: string }[] = [];
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Mailer).useValue({ delivery: 'LOCAL_FILE', send: async (email: string, kind: string, url: string) => { mailbox.push({ email, kind, url }); } }).compile();
  const app = module.createNestApplication(); configureApp(app); await app.init();
  const db = app.get(PrismaService); const worker = app.get(OutboxService); const password = 'Test-only-password!42';
  const call = (session: Session, method: 'get' | 'post' | 'patch', path: string, body?: object) => {
    const req = request(app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', session.cookie).set('Origin', 'http://localhost:3000').set('X-CSRF-Token', session.csrf);
    return body ? req.send(body) : req;
  };
  const login = async (email: string, secret = password): Promise<Session> => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', 'http://localhost:3000').send({ email, password: secret }).expect(201);
    assert.match(String(response.headers['set-cookie']), /HttpOnly/); assert.match(String(response.headers['set-cookie']), /SameSite=Lax/);
    return { cookie: (response.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!, csrf: response.body.csrfToken, id: response.body.user.id };
  };
  try {
    for (const [name, role] of [['admin', 'ADMIN'], ['manager', 'MANAGER'], ['salesa', 'SALES'], ['salesb', 'SALES'], ['tech', 'TECHNICAL'], ['viewer', 'VIEWER']] as [string, Role][]) await db.user.create({ data: { name, email: `${name}@example.invalid`, role, passwordHash: await hashPassword(password) } });
    const admin = await login('admin@example.invalid'); const manager = await login('manager@example.invalid'); const a = await login('salesa@example.invalid'); const b = await login('salesb@example.invalid'); const tech = await login('tech@example.invalid'); const viewer = await login('viewer@example.invalid');
    let companyId = ''; let otherCompanyId = ''; let contactId = ''; let opportunityId = ''; let taskId = '';
    await t.test('cookie session, CSRF, origin and deny-by-default', async () => {
      await request(app.getHttpServer()).get('/api/v1/companies').expect(401);
      await request(app.getHttpServer()).post('/api/v1/companies').set('Cookie', a.cookie).set('Origin', 'http://localhost:3000').send({}).expect(403);
      await request(app.getHttpServer()).post('/api/v1/companies').set('Cookie', a.cookie).set('X-CSRF-Token', a.csrf).set('Origin', 'https://evil.invalid').send({}).expect(403);
      await call(a, 'get', '/users').expect(403);
      await call(admin, 'patch', `/users/${admin.id}`, { isActive: false }).expect(400);
    });
    await t.test('firm ownership, duplicate warning, list/search and direct ID isolation', async () => {
      const company = await call(a, 'post', '/companies', { displayName: 'DEMO Private A', legalName: 'DEMO A', domain: 'a.example.invalid' }).expect(201); companyId = company.body.id;
      assert.equal(company.body.ownerId, a.id);
      const other = await call(b, 'post', '/companies', { displayName: 'DEMO Private B', legalName: 'DEMO B' }).expect(201); otherCompanyId = other.body.id;
      const duplicate = await call(a, 'post', '/companies', { displayName: 'DEMO Duplicate', legalName: 'DEMO A' }).expect(201); assert.equal(duplicate.body.duplicateWarnings.length, 1);
      await call(b, 'get', `/companies/${companyId}`).expect(404);
      const list = await call(b, 'get', '/companies?search=Private%20A').expect(200); assert.equal(list.body.total, 0);
      await call(b, 'get', `/companies/${companyId}/contacts`).expect(404);
      await call(b, 'get', `/companies/${companyId}/timeline`).expect(404);
      await call(manager, 'get', `/companies/${companyId}`).expect(200);
    });
    await t.test('READ/WRITE sharing, immediate revocation and VIEWER restrictions', async () => {
      await call(a, 'post', `/companies/${companyId}/shares`, { userId: b.id, permission: 'READ' }).expect(201);
      await call(b, 'get', `/companies/${companyId}`).expect(200);
      await call(b, 'patch', `/companies/${companyId}`, { sector: 'No' }).expect(404);
      await call(a, 'post', `/companies/${companyId}/shares`, { userId: b.id, permission: 'WRITE' }).expect(201);
      await call(b, 'patch', `/companies/${companyId}`, { sector: 'IT' }).expect(200);
      await call(b, 'post', `/companies/${companyId}/shares`, { userId: viewer.id, permission: 'READ' }).expect(403);
      await call(a, 'post', `/companies/${companyId}/shares`, { userId: b.id, permission: 'NONE' }).expect(201);
      await call(b, 'get', `/companies/${companyId}`).expect(404);
      await call(a, 'post', `/companies/${companyId}/shares`, { userId: viewer.id, permission: 'READ' }).expect(201);
      await call(viewer, 'get', `/companies/${companyId}`).expect(200);
      await call(viewer, 'post', '/companies', { displayName: 'No', legalName: 'No' }).expect(403);
    });
    await t.test('contacts, manual activities, foreign-context validation and timeline', async () => {
      const contact = await call(a, 'post', `/companies/${companyId}/contacts`, { firstName: 'DEMO', lastName: 'Kişi', decisionMaker: true }).expect(201); contactId = contact.body.id;
      const otherContact = await call(b, 'post', `/companies/${otherCompanyId}/contacts`, { firstName: 'Other', lastName: 'Contact' }).expect(201);
      const body = { companyId, contactId, type: 'CALL', summary: 'SECRETNOTE-NOT-IN-AUDIT', happenedAt: '2026-10-30T15:00:00+03:00', outcome: 'Takip planlandı' };
      const activity = await call(a, 'post', '/activities', body).expect(201);
      assert.equal(activity.body.source, 'MANUAL'); assert.equal(activity.body.happenedAt, '2026-10-30T12:00:00.000Z');
      await call(a, 'post', '/activities', { ...body, contactId: otherContact.body.id }).expect(404);
      await call(a, 'post', '/activities', { ...body, source: 'VERIFIED' }).expect(400);
      await call(b, 'get', `/activities/${activity.body.id}`).expect(404);
      const timeline = await call(a, 'get', `/companies/${companyId}/timeline`).expect(200); assert.equal(timeline.body.items[0].type, 'ACTIVITY');
    });
    await t.test('opportunity mandatory fields, decimal values and private scope', async () => {
      const body = { companyId, title: 'DEMO Firewall', estimatedValue: '12500.1250', currency: 'USD', probability: 25, nextActionAt: '2026-11-01T09:00:00Z' };
      await call(a, 'post', '/opportunities', { ...body, probability: 101 }).expect(400);
      const opportunity = await call(a, 'post', '/opportunities', body).expect(201); opportunityId = opportunity.body.id; assert.equal(opportunity.body.estimatedValue, '12500.125');
      await call(b, 'get', `/opportunities/${opportunityId}`).expect(404);
      const list = await call(b, 'get', `/opportunities?companyId=${companyId}`).expect(200); assert.equal(list.body.total, 0);
      await call(a, 'post', '/opportunities', { ...body, ownerId: b.id }).expect(403);
    });
    await t.test('atomic transitions, concurrency conflict, LOST/WON and reopen rules', async () => {
      const initial = await call(a, 'get', `/opportunities/${opportunityId}`).expect(200); assert.equal(initial.body.history.length, 1);
      await call(a, 'post', `/opportunities/${opportunityId}/stage-transitions`, { stage: 'LOST', version: 1 }).expect(400);
      const race = await Promise.all([call(a, 'post', `/opportunities/${opportunityId}/stage-transitions`, { stage: 'QUALIFICATION', version: 1 }), call(a, 'post', `/opportunities/${opportunityId}/stage-transitions`, { stage: 'NEEDS_ANALYSIS', version: 1 })]);
      assert.deepEqual(race.map(r => r.status).sort(), [201, 409]);
      const after = await call(a, 'get', `/opportunities/${opportunityId}`).expect(200); assert.equal(after.body.history.length, 2); assert.equal(after.body.version, 2);
      await call(a, 'post', `/opportunities/${opportunityId}/stage-transitions`, { stage: 'WON', version: 2, reason: 'Manuel' }).expect(403);
      await call(manager, 'post', `/opportunities/${opportunityId}/stage-transitions`, { stage: 'WON', version: 2, reason: 'Müşteri siparişi alındı' }).expect(201);
      await call(a, 'patch', `/opportunities/${opportunityId}`, { title: 'Closed edit', version: 3 }).expect(409);
      await call(manager, 'post', `/opportunities/${opportunityId}/stage-transitions`, { stage: 'NEGOTIATION', version: 3, reason: 'Yeni kapsam', nextActionAt: '2026-11-02T10:00:00Z' }).expect(201);
      await call(a, 'post', `/opportunities/${opportunityId}/stage-transitions`, { stage: 'LOST', version: 4, reason: 'Bütçe' }).expect(201);
      const final = await call(a, 'get', `/opportunities/${opportunityId}`).expect(200); assert.equal(final.body.wonAt, null); assert.ok(final.body.lostAt); assert.equal(final.body.history.length, 5);
    });
    await t.test('technical assignments expose only necessary task context', async () => {
      const task = await call(a, 'post', '/tasks', { companyId, opportunityId, title: 'DEMO Teknik keşif', description: 'Teknik gereksinimleri doğrula', assigneeId: tech.id, dueAt: new Date(Date.now() - 1000).toISOString() }).expect(201); taskId = task.body.id;
      await call(tech, 'get', `/companies/${companyId}`).expect(403);
      const technicalTask = await call(tech, 'get', `/tasks/${taskId}`).expect(200); assert.equal(technicalTask.body.opportunityId, undefined); assert.equal(technicalTask.body.company.notes, undefined);
      await call(tech, 'patch', `/tasks/${taskId}`, { title: 'No', version: 1 }).expect(403);
      await call(b, 'get', `/tasks/${taskId}`).expect(404);
      await call(viewer, 'patch', `/tasks/${taskId}`, { status: 'DONE', version: 1 }).expect(403);
    });
    await t.test('outbox workers deduplicate and retry without duplicate reminders', async () => {
      await Promise.all([worker.processOne(), worker.processOne()]); await worker.tick();
      assert.equal(await db.notification.count({ where: { taskId } }), 2);
      await db.outboxEvent.updateMany({ where: { taskId }, data: { status: 'PENDING' } });
      await worker.tick(); assert.equal(await db.notification.count({ where: { taskId } }), 2);
      const notifications = await call(tech, 'get', '/notifications').expect(200); assert.equal(notifications.body.length, 2);
      await call(tech, 'post', `/notifications/${notifications.body[0].id}/read`).expect(201);
      await call(b, 'post', `/notifications/${notifications.body[0].id}/read`).expect(404);
      await call(b, 'post', '/notifications/read-all').expect(201).expect(({ body }) => assert.equal(body.read, 0));
      const all = await call(tech, 'post', '/notifications/read-all').expect(201); assert.equal(all.body.read, 1);
      assert.ok((await call(tech, 'get', '/notifications').expect(200)).body.every((n: { readAt: string | null }) => n.readAt));
      await call(tech, 'patch', `/tasks/${taskId}`, { status: 'DONE', version: 1 }).expect(200);
      const task = await call(tech, 'get', `/tasks/${taskId}`).expect(200); assert.ok(task.body.completedAt);
    });
    await t.test('meetings use UTC and enforce participant/time consistency', async () => {
      const body = { companyId, title: 'DEMO Görüşme', startsAt: '2026-11-01T09:00:00+03:00', endsAt: '2026-11-01T10:00:00+03:00', attendees: [{ contactId }, { userId: a.id }] };
      const meeting = await call(a, 'post', '/meetings', body).expect(201); assert.equal(meeting.body.startsAt, '2026-11-01T06:00:00.000Z');
      await call(a, 'post', '/meetings', { ...body, endsAt: body.startsAt }).expect(400);
      await call(a, 'post', '/meetings', { ...body, attendees: [{ contactId, userId: a.id }] }).expect(400);
      await call(b, 'patch', `/meetings/${meeting.body.id}`, { notes: 'No access' }).expect(404);
      const path = `/meetings/${meeting.body.id}`;
      await call(b, 'get', path).expect(404);
      assert.equal(meeting.body.notesCreatedAt, null);
      await call(a, 'patch', path, { notes: 'spoof', notesCreatedBy: b.id }).expect(400);
      const first = await call(a, 'patch', path, { notes: 'First meeting note' }).expect(200);
      assert.equal(first.body.notesCreatedBy, a.id); assert.equal(first.body.notesCreatedByName, 'salesa');
      assert.ok(first.body.notesCreatedAt.endsWith('Z'));
      const unchanged = await call(manager, 'patch', path, { notes: 'First meeting note', location: 'Office' }).expect(200);
      assert.equal(unchanged.body.notesUpdatedAt, first.body.notesUpdatedAt);
      const edited = await call(manager, 'patch', path, { outcome: 'Manager decision' }).expect(200);
      assert.equal(edited.body.notesCreatedBy, a.id); assert.equal(edited.body.notesCreatedAt, first.body.notesCreatedAt);
      assert.equal(edited.body.notesUpdatedBy, manager.id); assert.equal(edited.body.notesUpdatedByName, 'manager');
      const reader = await call(a, 'get', path).expect(200); assert.equal(reader.body.outcome, 'Manager decision');
      await call(viewer, 'patch', path, { notes: 'Not allowed' }).expect(403);
      const legacy = await db.meeting.create({ data: { companyId, title: 'Legacy note', startsAt: new Date(), endsAt: new Date(Date.now() + 3600000), createdBy: a.id, notes: 'Older note' } });
      const legacyEdit = await call(manager, 'patch', `/meetings/${legacy.id}`, { notes: 'Updated older note' }).expect(200);
      assert.equal(legacyEdit.body.notesCreatedAt, null); assert.equal(legacyEdit.body.notesCreatedBy, null);
      assert.equal(legacyEdit.body.notesUpdatedBy, manager.id);
      const createdWithNotes = await call(a, 'post', '/meetings', { ...body, notes: 'During creation' }).expect(201);
      assert.equal(createdWithNotes.body.notesCreatedBy, a.id);
      // Meeting-time append: bullets go to the end under a row lock, parallel note takers do not overwrite each other.
      const notesPath = `${path}/notes`;
      await call(b, 'post', notesPath, { field: 'notes', text: 'No access' }).expect(404);
      await call(viewer, 'post', notesPath, { field: 'notes', text: 'Not allowed' }).expect(403);
      await call(a, 'post', notesPath, { field: 'notes', text: '   ' }).expect(400);
      await call(a, 'post', notesPath, { field: 'agenda', text: 'x' }).expect(400);
      await Promise.all([call(a, 'post', notesPath, { field: 'notes', text: 'Kurulum tarihi' }).expect(201), call(manager, 'post', notesPath, { field: 'notes', text: '- Lisans sayısı\n2) Eğitim ihtiyacı' }).expect(201)]);
      const appended = await call(a, 'get', path).expect(200);
      const lines = appended.body.notes.split('\n'); assert.equal(lines[0], 'First meeting note'); assert.equal(lines.length, 4);
      for (const line of ['- Kurulum tarihi', '- Lisans sayısı', '- Eğitim ihtiyacı']) assert.ok(lines.includes(line));
      assert.equal(appended.body.notesCreatedBy, a.id);
      const decision = await call(manager, 'post', notesPath, { field: 'outcome', text: 'Cuma keşif' }).expect(201);
      assert.equal(decision.body.outcome, 'Manager decision\n- Cuma keşif'); assert.equal(decision.body.notesUpdatedBy, manager.id);
      await call(a, 'patch', path, { notes: 'x'.repeat(4995) }).expect(200);
      await call(a, 'post', notesPath, { field: 'notes', text: 'Sınırı aşar' }).expect(400);
      await call(a, 'patch', path, { notes: 'x'.repeat(5001) }).expect(400);
    });
    await t.test('role changes and deactivation immediately affect existing sessions', async () => {
      await call(admin, 'patch', `/users/${b.id}`, { role: 'VIEWER' }).expect(200);
      await call(b, 'post', '/companies', { displayName: 'No', legalName: 'No' }).expect(403);
      await call(admin, 'patch', `/users/${b.id}`, { isActive: false }).expect(200);
      await call(b, 'get', '/auth/me').expect(401);
    });
    await t.test('invitation and reset tokens are single-use and revoke sessions', async () => {
      await call(admin, 'post', '/users/invitations', { email: 'invited@example.invalid', name: 'Invited', role: 'SALES' }).expect(201);
      const invitation = mailbox.find(m => m.kind === 'INVITE')!; const token = new URLSearchParams(new URL(invitation.url).hash.slice(1)).get('token');
      await request(app.getHttpServer()).post('/api/v1/auth/invitation/accept').set('Origin', 'http://localhost:3000').send({ token, password }).expect(201);
      await request(app.getHttpServer()).post('/api/v1/auth/invitation/accept').set('Origin', 'http://localhost:3000').send({ token, password }).expect(400);
      const invited = await login('invited@example.invalid');
      const reset = (email: string) => request(app.getHttpServer()).post('/api/v1/auth/password-reset/request').set('Origin', 'http://localhost:3000').send({ email });
      const known = await reset('invited@example.invalid').expect(201); const unknown = await reset('absent@example.invalid').expect(201); assert.deepEqual(known.body, unknown.body);
      const resetMail = mailbox.find(m => m.kind === 'RESET')!; const resetToken = new URLSearchParams(new URL(resetMail.url).hash.slice(1)).get('token');
      await request(app.getHttpServer()).post('/api/v1/auth/password-reset/confirm').set('Origin', 'http://localhost:3000').send({ token: resetToken, password: `${password}new` }).expect(201);
      await call(invited, 'get', '/auth/me').expect(401);
      await login('invited@example.invalid', `${password}new`);
    });
    await t.test('archive preserves history and audit omits secrets/free text', async () => {
      await call(a, 'post', `/companies/${companyId}/archive`, { archived: true }).expect(201);
      await call(a, 'patch', `/companies/${companyId}`, { notes: 'Blocked' }).expect(403);
      await call(a, 'get', `/companies/${companyId}/timeline`).expect(200);
      const logs = JSON.stringify(await db.auditLog.findMany());
      assert.ok(!logs.includes(password)); assert.ok(!logs.includes(a.csrf)); assert.ok(!logs.includes('SECRETNOTE-NOT-IN-AUDIT'));
      await call(a, 'get', '/audit-logs').expect(403); await call(admin, 'get', '/audit-logs').expect(200);
      await call(a, 'post', '/auth/logout').expect(201); await call(a, 'get', '/auth/me').expect(401);
    });
  } finally { await app.close(); }
});
