import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { hashPassword } from '../src/auth/auth.service';
import { configureApp } from '../src/http';
import { Role } from '../src/generated/prisma/client';

type Session = { cookie: string; csrf: string; id: string };
const origin = 'http://localhost:3000';
const nonce = () => randomBytes(12).toString('hex');
test('Phase 8 (F8-02): team messaging core', async t => {
  if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.startsWith('/saleshub_test_')) throw new Error('Isolated database required');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; process.env.NODE_ENV = 'test';
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication(); configureApp(app); await app.init(); const db = app.get(PrismaService);
  const call = (s: Session, method: 'get' | 'post' | 'patch', path: string, body?: object) => {
    const r = request(app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', s.cookie).set('Origin', origin).set('X-CSRF-Token', s.csrf); return body ? r.send(body) : r;
  };
  const post = (s: Session, conversationId: string, body: string, extra: object = {}) => call(s, 'post', `/messaging/conversations/${conversationId}/messages`, { body, clientNonce: nonce(), ...extra });
  const login = async (role: Role, name: string): Promise<Session> => {
    const email = `p8-${name}@example.invalid`; const password = 'Test-only-password!42';
    await db.user.create({ data: { name, email, role, passwordHash: await hashPassword(password) } });
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', origin).send({ email, password }).expect(201);
    return { cookie: (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!, csrf: r.body.csrfToken, id: r.body.user.id };
  };
  try {
    const admin = await login('ADMIN', 'admin'); const manager = await login('MANAGER', 'manager');
    const salesA = await login('SALES', 'sales-a'); const salesB = await login('SALES', 'sales-b');
    const tech = await login('TECHNICAL', 'tech'); const tech2 = await login('TECHNICAL', 'tech2'); const viewer = await login('VIEWER', 'viewer');
    const channel = async (s: Session, name: string) => (await call(s, 'get', '/messaging/conversations?kind=CHANNEL').expect(200)).body.items.find((c: { name: string }) => c.name === name);

    await t.test('starting channels: everyone reads public channels, posting needs membership, #duyurular is managers only', async () => {
      const genel = await channel(viewer, 'genel');
      assert.ok(genel); assert.equal(genel.joined, false);
      assert.deepEqual((await call(viewer, 'get', '/messaging/conversations?kind=CHANNEL').expect(200)).body.items.map((c: { name: string }) => c.name).sort(), ['duyurular', 'genel', 'satış', 'teknik']);
      await post(salesA, genel.id, 'Katılmadan yazamam').expect(403);
      await call(salesA, 'post', `/messaging/conversations/${genel.id}/join`).expect(201);
      const first = (await post(salesA, genel.id, 'Merhaba ekip').expect(201)).body;
      assert.equal(first.seq, 1);
      await call(viewer, 'post', `/messaging/conversations/${genel.id}/join`).expect(201);
      await post(viewer, genel.id, 'Salt okunur').expect(403);
      assert.equal((await call(viewer, 'get', `/messaging/conversations/${genel.id}/messages`).expect(200)).body.items[0].body, 'Merhaba ekip');
      const duyurular = await channel(salesA, 'duyurular');
      for (const s of [salesA, manager]) await call(s, 'post', `/messaging/conversations/${duyurular.id}/join`).expect(201);
      await post(salesA, duyurular.id, 'Duyuru').expect(403);
      await post(manager, duyurular.id, 'Cuma toplantısı 10:00').expect(201);
    });

    await t.test('channel management: only channels.manage holders create; names are unique regardless of case', async () => {
      await call(salesA, 'post', '/messaging/conversations', { kind: 'CHANNEL', name: 'pazarlama' }).expect(403);
      const created = (await call(manager, 'post', '/messaging/conversations', { kind: 'CHANNEL', name: '#Pazarlama', isPublic: true }).expect(201)).body;
      assert.equal(created.name, 'pazarlama');
      await call(admin, 'post', '/messaging/conversations', { kind: 'CHANNEL', name: 'PAZARLAMA' }).expect(409);
      await call(manager, 'post', '/messaging/conversations', { kind: 'CHANNEL', name: 'boşluk var' }).expect(400);
      await call(manager, 'patch', `/messaging/conversations/${created.id}`, { archived: true }).expect(200);
      await call(manager, 'post', `/messaging/conversations/${created.id}/messages`, { body: 'x', clientNonce: nonce() }).expect(409);
      await call(salesA, 'post', `/messaging/conversations/${created.id}/join`).expect(409);
    });

    await t.test('private groups and direct messages are invisible to non-members, ADMIN included', async () => {
      const group = (await call(salesA, 'post', '/messaging/conversations', { kind: 'GROUP', name: 'İhale ekibi', memberIds: [tech.id] }).expect(201)).body;
      assert.equal(group.myRole, 'OWNER'); assert.equal(group.memberCount, 2);
      await post(tech, group.id, 'Keşif notları hazır').expect(201);
      const dm = (await call(salesA, 'post', '/messaging/direct', { userId: viewer.id }).expect(201)).body;
      assert.equal(dm.name, 'viewer');
      assert.equal((await call(viewer, 'post', '/messaging/direct', { userId: salesA.id }).expect(201)).body.id, dm.id);
      await post(viewer, dm.id, 'Raporu gördüm').expect(201);
      for (const id of [group.id, dm.id]) for (const outsider of [admin, manager, salesB]) {
        await call(outsider, 'get', `/messaging/conversations/${id}`).expect(404);
        await call(outsider, 'get', `/messaging/conversations/${id}/messages`).expect(404);
        await post(outsider, id, 'Sızma').expect(404);
        await call(outsider, 'post', `/messaging/conversations/${id}/read`, { seq: 1 }).expect(404);
        assert.ok(!(await call(outsider, 'get', '/messaging/conversations').expect(200)).body.items.some((c: { id: string }) => c.id === id));
      }
      await call(salesA, 'post', '/messaging/conversations', { kind: 'GROUP', name: 'Geçersiz', memberIds: [viewer.id] }).expect(400);
      await call(viewer, 'post', '/messaging/conversations', { kind: 'GROUP', name: 'Okur', memberIds: [salesA.id] }).expect(403);
      await call(tech, 'post', `/messaging/conversations/${group.id}/members`, { userIds: [tech2.id] }).expect(403);
      await call(salesA, 'post', `/messaging/conversations/${group.id}/members`, { userIds: [tech2.id] }).expect(201);
      await call(salesA, 'post', `/messaging/conversations/${group.id}/members/${tech.id}/remove`).expect(201);
      await call(tech, 'get', `/messaging/conversations/${group.id}/messages`).expect(404);
      // A sole owner leaving hands the group to the longest-standing remaining member.
      await call(salesA, 'post', `/messaging/conversations/${group.id}/leave`).expect(201);
      assert.equal((await call(tech2, 'get', `/messaging/conversations/${group.id}`).expect(200)).body.myRole, 'OWNER');
      await call(salesA, 'get', `/messaging/conversations/${group.id}`).expect(404);
      await call(salesA, 'post', `/messaging/conversations/${dm.id}/leave`).expect(400);
    });

    await t.test('record conversations follow company scope and react to share changes immediately', async () => {
      const company = (await call(salesA, 'post', '/companies', { displayName: 'P8 Firma', legalName: 'P8 Firma AŞ' }).expect(201)).body;
      await call(salesB, 'post', '/messaging/record-conversations', { recordType: 'COMPANY', recordId: company.id }).expect(404);
      const conv = (await call(salesA, 'post', '/messaging/record-conversations', { recordType: 'COMPANY', recordId: company.id }).expect(201)).body;
      assert.equal(conv.record.title, 'P8 Firma'); assert.equal(conv.canPost, true);
      assert.equal((await call(salesA, 'post', '/messaging/record-conversations', { recordType: 'COMPANY', recordId: company.id }).expect(201)).body.id, conv.id);
      await post(salesA, conv.id, 'Müşteri bütçeyi onayladı').expect(201);
      await call(salesB, 'get', `/messaging/conversations/${conv.id}`).expect(404);
      await call(salesB, 'get', `/messaging/conversations/${conv.id}/messages`).expect(404);
      await call(tech, 'get', `/messaging/conversations/${conv.id}`).expect(404);
      await call(viewer, 'get', `/messaging/conversations/${conv.id}`).expect(404);

      await call(salesA, 'post', `/companies/${company.id}/shares`, { userId: salesB.id, permission: 'READ' }).expect(201);
      const shared = (await call(salesB, 'get', `/messaging/conversations/${conv.id}`).expect(200)).body;
      assert.equal(shared.canPost, false);
      await post(salesB, conv.id, 'Okuma paylaşımıyla yazamam').expect(403);
      await call(salesA, 'post', `/companies/${company.id}/shares`, { userId: salesB.id, permission: 'WRITE' }).expect(201);
      await post(salesB, conv.id, 'Teklifi hazırlıyorum').expect(201);
      await call(salesB, 'post', '/messaging/record-conversations', { recordType: 'COMPANY', recordId: company.id }).expect(201);
      assert.ok((await call(salesB, 'get', '/messaging/conversations?kind=RECORD').expect(200)).body.items.some((c: { id: string }) => c.id === conv.id));

      await call(salesA, 'post', `/companies/${company.id}/shares`, { userId: salesB.id, permission: 'NONE' }).expect(201);
      await call(salesB, 'get', `/messaging/conversations/${conv.id}/messages`).expect(404);
      await post(salesB, conv.id, 'Erişim kalktı').expect(404);
      assert.ok(!(await call(salesB, 'get', '/messaging/conversations').expect(200)).body.items.some((c: { id: string }) => c.id === conv.id));

      assert.equal((await call(manager, 'get', `/messaging/conversations/${conv.id}/messages`).expect(200)).body.items.length, 2);
      await call(salesA, 'post', `/companies/${company.id}/archive`, { archived: true }).expect(201);
      assert.equal((await call(salesA, 'get', `/messaging/conversations/${conv.id}`).expect(200)).body.canPost, false);
      await post(salesA, conv.id, 'Arşivde').expect(403);
    });

    await t.test('opportunity conversations are closed to technicians; project conversations open to assigned technicians only', async () => {
      const company = (await call(salesA, 'post', '/companies', { displayName: 'P8 Teslimat', legalName: 'P8 Teslimat AŞ' }).expect(201)).body;
      const opp = (await call(salesA, 'post', '/opportunities', { companyId: company.id, title: 'P8 Sunucu yenileme', estimatedValue: '9000', currency: 'TRY', probability: 70, nextActionAt: '2030-01-01T00:00:00Z' }).expect(201)).body;
      const oppConv = (await call(salesA, 'post', '/messaging/record-conversations', { recordType: 'OPPORTUNITY', recordId: opp.id }).expect(201)).body;
      await post(salesA, oppConv.id, 'İndirim payı %5').expect(201);
      await call(tech, 'post', '/messaging/record-conversations', { recordType: 'OPPORTUNITY', recordId: opp.id }).expect(404);
      await call(tech, 'get', `/messaging/conversations/${oppConv.id}/messages`).expect(404);
      await call(admin, 'post', `/opportunities/${opp.id}/stage-transitions`, { stage: 'WON', version: opp.version, reason: 'Sipariş geldi' }).expect(201);
      const handoff = (await call(salesA, 'post', `/handoffs/from-opportunity/${opp.id}`, { ownerId: tech.id, summary: 'Sunucu kurulumu', dueAt: '2030-02-01T09:00:00Z' }).expect(201)).body;
      const projectConv = (await call(tech, 'post', '/messaging/record-conversations', { recordType: 'PROJECT', recordId: handoff.projectId }).expect(201)).body;
      assert.equal(projectConv.canPost, true);
      assert.doesNotMatch(JSON.stringify(projectConv), /İndirim|9000|estimatedValue/);
      await post(tech, projectConv.id, 'Montaj salı günü').expect(201);
      await post(salesA, projectConv.id, 'Müşteriye bildirdim').expect(201);
      await call(tech2, 'post', '/messaging/record-conversations', { recordType: 'PROJECT', recordId: handoff.projectId }).expect(404);
      await call(tech2, 'get', `/messaging/conversations/${projectConv.id}`).expect(404);
      await call(viewer, 'post', '/messaging/record-conversations', { recordType: 'PROJECT', recordId: handoff.projectId }).expect(404);
    });

    await t.test('retries with the same clientNonce post once; sequence numbers stay gap-free under concurrency', async () => {
      const dm = (await call(salesA, 'post', '/messaging/direct', { userId: salesB.id }).expect(201)).body;
      const body = { body: 'Tek sefer', clientNonce: nonce() };
      const replies = await Promise.all([1, 2, 3].map(() => call(salesA, 'post', `/messaging/conversations/${dm.id}/messages`, body)));
      assert.deepEqual(replies.map(r => r.status), [201, 201, 201]);
      assert.equal(new Set(replies.map(r => r.body.id)).size, 1);
      assert.equal(await db.message.count({ where: { conversationId: dm.id } }), 1);
      await call(salesA, 'post', `/messaging/conversations/${dm.id}/messages`, { ...body, body: 'Başka içerik' }).expect(409);
      await Promise.all(Array.from({ length: 10 }, (_, i) => post(i % 2 ? salesA : salesB, dm.id, `Eşzamanlı ${i}`).expect(201)));
      const seqs = (await db.message.findMany({ where: { conversationId: dm.id }, orderBy: { seq: 'asc' }, select: { seq: true } })).map(m => m.seq);
      assert.deepEqual(seqs, Array.from({ length: 11 }, (_, i) => i + 1));
    });

    await t.test('unread counts, read markers, one-level threads and cursor paging', async () => {
      const dm = (await call(tech, 'post', '/messaging/direct', { userId: manager.id }).expect(201)).body;
      for (let i = 1; i <= 5; i++) await post(tech, dm.id, `Mesaj ${i}`).expect(201);
      const listed = (await call(manager, 'get', '/messaging/conversations?kind=DIRECT').expect(200)).body;
      assert.equal(listed.items.find((c: { id: string }) => c.id === dm.id).unread, 5);
      assert.ok(listed.unreadTotal >= 5);
      assert.equal((await call(tech, 'get', '/messaging/conversations?kind=DIRECT').expect(200)).body.items.find((c: { id: string }) => c.id === dm.id).unread, 0);
      await call(manager, 'post', `/messaging/conversations/${dm.id}/read`, { seq: 3 }).expect(201);
      await call(manager, 'post', `/messaging/conversations/${dm.id}/read`, { seq: 1 }).expect(201);
      await call(manager, 'post', `/messaging/conversations/${dm.id}/read`, { seq: 999 }).expect(201);
      assert.equal((await call(manager, 'get', `/messaging/conversations/${dm.id}`).expect(200)).body.unread, 0);

      const page = (await call(manager, 'get', `/messaging/conversations/${dm.id}/messages?limit=2`).expect(200)).body;
      assert.deepEqual(page.items.map((m: { seq: number }) => m.seq), [4, 5]); assert.equal(page.hasMore, true);
      const older = (await call(manager, 'get', `/messaging/conversations/${dm.id}/messages?limit=10&beforeSeq=4`).expect(200)).body;
      assert.deepEqual(older.items.map((m: { seq: number }) => m.seq), [1, 2, 3]); assert.equal(older.hasMore, false);
      assert.deepEqual((await call(manager, 'get', `/messaging/conversations/${dm.id}/messages?afterSeq=3`).expect(200)).body.items.map((m: { seq: number }) => m.seq), [4, 5]);

      const parent = page.items[0];
      const reply = (await post(manager, dm.id, 'Yanıt', { parentId: parent.id }).expect(201)).body;
      await post(manager, dm.id, 'Yanıta yanıt', { parentId: reply.id }).expect(404);
      const other = (await call(tech, 'post', '/messaging/direct', { userId: salesA.id }).expect(201)).body;
      await post(tech, other.id, 'Başka konuşmadaki üst mesaj', { parentId: parent.id }).expect(404);
      const top = (await call(manager, 'get', `/messaging/conversations/${dm.id}/messages`).expect(200)).body.items;
      assert.ok(!top.some((m: { id: string }) => m.id === reply.id));
      assert.equal(top.find((m: { id: string }) => m.id === parent.id).replyCount, 1);
      assert.deepEqual((await call(manager, 'get', `/messaging/conversations/${dm.id}/messages?parentId=${parent.id}`).expect(200)).body.items.map((m: { id: string }) => m.id), [reply.id]);
    });

    await t.test('message text is validated and stored append-only at the database level', async () => {
      const dm = (await call(salesA, 'post', '/messaging/direct', { userId: manager.id }).expect(201)).body;
      await post(salesA, dm.id, 'zil\u0007sesi').expect(400);
      await post(salesA, dm.id, 'x'.repeat(4001)).expect(400);
      await post(salesA, dm.id, '   ').expect(400);
      const html = (await post(salesA, dm.id, '<script>alert(1)</script>\nikinci satır').expect(201)).body;
      assert.equal(html.body, '<script>alert(1)</script>\nikinci satır');
      await assert.rejects(db.message.update({ where: { id: html.id }, data: { body: 'değiştirildi' } }));
      await assert.rejects(db.message.delete({ where: { id: html.id } }));
      const people = (await call(tech, 'get', '/messaging/users?search=sales').expect(200)).body;
      assert.deepEqual(Object.keys(people[0]).sort(), ['id', 'name', 'role']);
    });

    await t.test('deactivated members keep their history but lose access with their session', async () => {
      const dm = (await call(salesB, 'post', '/messaging/direct', { userId: tech2.id }).expect(201)).body;
      await post(tech2, dm.id, 'Ayrılmadan önce').expect(201);
      await call(admin, 'patch', `/users/${tech2.id}`, { isActive: false }).expect(200);
      await call(tech2, 'get', `/messaging/conversations/${dm.id}/messages`).expect(401);
      const seen = (await call(salesB, 'get', `/messaging/conversations/${dm.id}/messages`).expect(200)).body.items[0];
      assert.deepEqual(seen.author, { id: tech2.id, name: 'tech2', isActive: false });
      await call(salesB, 'post', '/messaging/direct', { userId: tech2.id }).expect(404);
    });
  } finally {
    // All spec files log in from one address; release this file's login budget so later files are not rate limited.
    await db.rateLimit.deleteMany({});
    await app.close();
  }
});
