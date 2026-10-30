import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { hashPassword } from '../src/auth/auth.service';
import { configureApp } from '../src/http';
import { Role } from '../src/generated/prisma/client';
import { MessageRetentionService } from '../src/messaging/retention.service';
import { FilesService } from '../src/sales/files.service';

type Session = { cookie: string; csrf: string; id: string };
const origin = 'http://localhost:3000';
const nonce = () => randomBytes(12).toString('hex');
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

test('Phase 8 (F8-06): edit history, deletion, moderation, pins, mute, search, knowledge and retention', async t => {
  if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.startsWith('/saleshub_test_')) throw new Error('Isolated database required');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; process.env.NODE_ENV = 'test';
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication(); configureApp(app); await app.init(); const db = app.get(PrismaService); const files = app.get(FilesService);
  const call = (s: Session, method: 'get' | 'post' | 'patch', path: string, body?: object) => {
    const r = request(app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', s.cookie).set('Origin', origin).set('X-CSRF-Token', s.csrf); return body ? r.send(body) : r;
  };
  const post = (s: Session, conversationId: string, body: string, extra: object = {}) => call(s, 'post', `/messaging/conversations/${conversationId}/messages`, { body, clientNonce: nonce(), ...extra });
  const upload = (s: Session, conversationId: string, name: string, bytes: Buffer) => request(app.getHttpServer()).post(`/api/v1/messaging/conversations/${conversationId}/attachments?name=${encodeURIComponent(name)}`).set('Cookie', s.cookie).set('Origin', origin).set('X-CSRF-Token', s.csrf).set('Content-Type', 'application/octet-stream').send(bytes);
  const messages = async (s: Session, conversationId: string) => (await call(s, 'get', `/messaging/conversations/${conversationId}/messages?limit=100`).expect(200)).body.items as { id: string; body: string; state: string; hiddenReason: string | null; editedAt: string | null; pinnedAt: string | null; attachments: unknown[]; mentions: unknown[] }[];
  /** Messages with a past timestamp (createdAt is immutable through the API and the database trigger). */
  const backdated = (conversationId: string, authorId: string, body: string, createdAt: Date) => db.$transaction(async tx => {
    const { lastSeq } = await tx.conversation.update({ where: { id: conversationId }, data: { lastSeq: { increment: 1 } }, select: { lastSeq: true } });
    return tx.message.create({ data: { conversationId, seq: lastSeq, authorId, body, clientNonce: nonce(), createdAt } });
  });
  const login = async (role: Role, name: string): Promise<Session> => {
    const email = `p8c-${name}@example.invalid`; const password = 'Test-only-password!42';
    await db.user.create({ data: { name, email, role, passwordHash: await hashPassword(password) } });
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', origin).send({ email, password }).expect(201);
    return { cookie: (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!, csrf: r.body.csrfToken, id: r.body.user.id };
  };
  try {
    const manager = await login('MANAGER', 'manager'); const salesA = await login('SALES', 'sales-a'); const salesB = await login('SALES', 'sales-b');
    const tech = await login('TECHNICAL', 'tech'); const viewer = await login('VIEWER', 'viewer');
    const dm = (await call(salesA, 'post', '/messaging/direct', { userId: salesB.id }).expect(201)).body;
    const genel = (await call(salesA, 'get', '/messaging/conversations?kind=CHANNEL').expect(200)).body.items.find((c: { name: string }) => c.name === 'genel');
    for (const s of [salesA, salesB, manager, viewer]) await call(s, 'post', `/messaging/conversations/${genel.id}/join`).expect(201);

    await t.test('authors edit within 15 minutes; history is kept by the database and cannot be skipped', async () => {
      const m = (await post(salesA, dm.id, 'Fiyat 1000 TL').expect(201)).body;
      await call(salesB, 'patch', `/messaging/messages/${m.id}`, { body: 'Ele geçirildi' }).expect(403);
      const edited = (await call(salesA, 'patch', `/messaging/messages/${m.id}`, { body: 'Fiyat 1200 TL' }).expect(200)).body;
      assert.equal(edited.body, 'Fiyat 1200 TL'); assert.ok(edited.editedAt);
      await call(salesA, 'patch', `/messaging/messages/${m.id}`, { body: 'Fiyat 1250 TL' }).expect(200);
      const history = (await call(salesB, 'get', `/messaging/messages/${m.id}/revisions`).expect(200)).body;
      assert.deepEqual(history.map((h: { body: string; current: boolean }) => [h.body, h.current]), [['Fiyat 1000 TL', false], ['Fiyat 1200 TL', false], ['Fiyat 1250 TL', true]]);
      await call(tech, 'get', `/messaging/messages/${m.id}/revisions`).expect(404);
      await assert.rejects(db.message.update({ where: { id: m.id }, data: { body: 'Geçmişsiz değişiklik' } }));
      const old = await backdated(dm.id, salesA.id, 'Eski mesaj', new Date(Date.now() - 16 * 60_000));
      assert.match((await call(salesA, 'patch', `/messaging/messages/${old.id}`, { body: 'Geç düzeltme' }).expect(409)).body.error.message, /15 dakika/);
      await assert.rejects(db.message.update({ where: { id: old.id }, data: { body: 'Geç düzeltme', editedAt: new Date() } }));
      await assert.rejects(db.message.update({ where: { id: m.id }, data: { createdAt: new Date() } }));
      await assert.rejects(db.messageRevision.deleteMany({ where: { messageId: m.id } }));
    });

    await t.test('soft deletion: placeholder stays, content, files and notifications are no longer served', async () => {
      const file = (await upload(salesA, dm.id, 'teklif.pdf', pdf).expect(201)).body;
      const m = (await post(salesA, dm.id, '@sales-b gizli teklif', { attachmentIds: [file.id], mentionIds: [salesB.id] }).expect(201)).body;
      assert.ok((await call(salesB, 'get', '/notifications').expect(200)).body.some((n: { messageId: string }) => n.messageId === m.id));
      await call(salesB, 'post', `/messaging/messages/${m.id}/delete`).expect(403);
      const deleted = (await call(salesA, 'post', `/messaging/messages/${m.id}/delete`).expect(201)).body;
      assert.deepEqual([deleted.state, deleted.body, deleted.attachments, deleted.mentions], ['DELETED', '', [], []]);
      const seen = (await messages(salesB, dm.id)).find(x => x.id === m.id)!;
      assert.equal(seen.state, 'DELETED'); assert.doesNotMatch(JSON.stringify(seen), /gizli teklif/);
      await request(app.getHttpServer()).get(`/api/v1/messaging/attachments/${file.id}`).set('Cookie', salesB.cookie).expect(404);
      assert.ok(!(await call(salesB, 'get', `/messaging/conversations/${dm.id}/attachments`).expect(200)).body.some((f: { id: string }) => f.id === file.id));
      assert.ok(!(await call(salesB, 'get', '/notifications').expect(200)).body.some((n: { messageId: string }) => n.messageId === m.id));
      await post(salesB, dm.id, 'Silinmişe yanıt', { parentId: m.id }).expect(404);
      await call(salesA, 'patch', `/messaging/messages/${m.id}`, { body: 'geri' }).expect(409);
      await call(salesA, 'post', `/messaging/messages/${m.id}/delete`).expect(409);
      await assert.rejects(db.message.update({ where: { id: m.id }, data: { deletedAt: null, deletedById: null } }));
      await assert.rejects(db.message.delete({ where: { id: m.id } }));
      assert.ok(await db.auditLog.findFirst({ where: { action: 'MESSAGE_DELETE', entityId: m.id } }));
    });

    await t.test('moderation: channel and record managers hide with a reason; private conversations have no moderator', async () => {
      const m = (await post(salesA, genel.id, 'Uygunsuz içerik').expect(201)).body;
      await call(salesB, 'post', `/messaging/messages/${m.id}/hide`, { reason: 'Kurallara aykırı' }).expect(403);
      await call(manager, 'post', `/messaging/messages/${m.id}/hide`, { reason: 'x' }).expect(400);
      const hidden = (await call(manager, 'post', `/messaging/messages/${m.id}/hide`, { reason: 'Kurallara aykırı' }).expect(201)).body;
      assert.deepEqual([hidden.state, hidden.body, hidden.hiddenReason], ['HIDDEN', '', 'Kurallara aykırı']);
      assert.doesNotMatch(JSON.stringify(await messages(salesB, genel.id)), /Uygunsuz içerik/);
      assert.equal((await call(salesB, 'get', '/messaging/search?q=uygunsuz').expect(200)).body.items.length, 0);
      await call(salesA, 'patch', `/messaging/messages/${m.id}`, { body: 'düzelttim' }).expect(409);
      assert.equal((await call(manager, 'post', `/messaging/messages/${m.id}/unhide`).expect(201)).body.body, 'Uygunsuz içerik');
      const log = await db.auditLog.findFirstOrThrow({ where: { action: 'MESSAGE_HIDE', entityId: m.id } });
      assert.equal((log.metadata as { reason: string }).reason, 'Kurallara aykırı');
      const group = (await call(salesA, 'post', '/messaging/conversations', { kind: 'GROUP', name: 'Moderasyonsuz', memberIds: [manager.id] }).expect(201)).body;
      const inGroup = (await post(salesA, group.id, 'Grup içi').expect(201)).body;
      await call(manager, 'post', `/messaging/messages/${inGroup.id}/hide`, { reason: 'Denetim denemesi' }).expect(403);
      assert.equal((await call(manager, 'get', `/messaging/conversations/${group.id}`).expect(200)).body.canModerate, false);
      const company = (await call(salesA, 'post', '/companies', { displayName: 'P8C Firma', legalName: 'P8C Firma AŞ' }).expect(201)).body;
      const record = (await call(salesA, 'post', '/messaging/record-conversations', { recordType: 'COMPANY', recordId: company.id }).expect(201)).body;
      const inRecord = (await post(salesA, record.id, 'Kayıt mesajı').expect(201)).body;
      await call(manager, 'post', `/messaging/messages/${inRecord.id}/hide`, { reason: 'Müşteri verisi içeriyor' }).expect(201);
    });

    await t.test('pins: any writer pins up to 20 per conversation; viewers cannot; removed messages drop out', async () => {
      const group = (await call(salesA, 'post', '/messaging/conversations', { kind: 'GROUP', name: 'Sabitler', memberIds: [salesB.id] }).expect(201)).body;
      const ids: string[] = [];
      for (let i = 0; i < 21; i++) ids.push((await post(salesA, group.id, `Not ${i}`).expect(201)).body.id);
      for (const id of ids.slice(0, 20)) await call(salesB, 'post', `/messaging/messages/${id}/pin`).expect(201);
      assert.match((await call(salesB, 'post', `/messaging/messages/${ids[20]}/pin`).expect(409)).body.error.message, /en fazla 20/);
      await call(salesA, 'post', `/messaging/messages/${ids[0]}/delete`).expect(201);
      const pins = (await call(salesA, 'get', `/messaging/conversations/${group.id}/pins`).expect(200)).body;
      assert.equal(pins.length, 19); assert.ok(!pins.some((p: { id: string }) => p.id === ids[0]));
      await call(salesB, 'post', `/messaging/messages/${ids[20]}/pin`).expect(201);
      await call(salesA, 'post', `/messaging/messages/${ids[20]}/unpin`).expect(201);
      const announcement = (await post(salesA, genel.id, 'Sabitlenecek duyuru').expect(201)).body;
      await call(viewer, 'post', `/messaging/messages/${announcement.id}/pin`).expect(403);
      await call(tech, 'get', `/messaging/conversations/${group.id}/pins`).expect(404);
    });

    await t.test('mute: no direct or reply notifications and no menu total, but mentions still notify', async () => {
      await call(salesB, 'post', `/messaging/conversations/${dm.id}/mute`, { until: new Date(Date.now() + 3600_000).toISOString() }).expect(201);
      const before = await db.notification.count({ where: { userId: salesB.id } });
      await post(salesA, dm.id, 'Sessizdeyken').expect(201);
      assert.equal(await db.notification.count({ where: { userId: salesB.id } }), before);
      const list = (await call(salesB, 'get', '/messaging/conversations').expect(200)).body;
      const item = list.items.find((c: { id: string }) => c.id === dm.id);
      assert.ok(item.mutedUntil); assert.ok(item.unread > 0);
      assert.equal(list.unreadTotal, list.items.filter((c: { mutedUntil: string | null }) => !c.mutedUntil).reduce((n: number, c: { unread: number }) => n + c.unread, 0));
      await post(salesA, dm.id, '@sales-b acil', { mentionIds: [salesB.id] }).expect(201);
      assert.equal(await db.notification.count({ where: { userId: salesB.id } }), before + 1);
      await call(salesB, 'post', `/messaging/conversations/${dm.id}/mute`, { until: null }).expect(201);
      await post(salesA, dm.id, 'Sessizlik bitti').expect(201);
      assert.equal(await db.notification.count({ where: { userId: salesB.id } }), before + 2);
    });

    await t.test('search: Turkish stems and prefixes, file names, only readable conversations, no removed content', async () => {
      const company = (await call(salesA, 'post', '/companies', { displayName: 'P8C Arama', legalName: 'P8C Arama AŞ' }).expect(201)).body;
      const record = (await call(salesA, 'post', '/messaging/record-conversations', { recordType: 'COMPANY', recordId: company.id }).expect(201)).body;
      const secret = (await post(salesA, record.id, 'Müşterinin teklifleri yarın gönderiliyor').expect(201)).body;
      const open = (await post(salesA, dm.id, 'Teklifler hazırlanıyor, şartnameyi bekliyoruz').expect(201)).body;
      const file = (await upload(salesA, dm.id, 'Ek-Şartname-v2.pdf', pdf).expect(201)).body;
      await post(salesA, dm.id, '', { attachmentIds: [file.id] }).expect(201);
      const mine = (await call(salesA, 'get', '/messaging/search?q=teklif').expect(200)).body.items.map((i: { message: { id: string } }) => i.message.id);
      assert.ok(mine.includes(secret.id) && mine.includes(open.id));
      const other = (await call(salesB, 'get', '/messaging/search?q=teklif').expect(200)).body.items;
      assert.ok(other.some((i: { message: { id: string } }) => i.message.id === open.id));
      assert.ok(!other.some((i: { message: { id: string } }) => i.message.id === secret.id));
      assert.equal(other.find((i: { message: { id: string } }) => i.message.id === open.id).conversation.name, 'sales-a');
      assert.ok((await call(salesA, 'get', '/messaging/search?q=gönder').expect(200)).body.items.some((i: { message: { id: string } }) => i.message.id === secret.id));
      assert.ok((await call(salesB, 'get', '/messaging/search?q=şartname').expect(200)).body.items.some((i: { message: { attachments: { id: string }[] } }) => i.message.attachments.some(a => a.id === file.id)));
      assert.equal((await call(salesA, 'get', `/messaging/search?q=teklif&conversationId=${record.id}`).expect(200)).body.items.length, 1);
      await call(salesA, 'get', '/messaging/search?q=!!').expect(400);
      await call(salesA, 'post', `/messaging/messages/${open.id}/delete`).expect(201);
      assert.ok(!(await call(salesB, 'get', '/messaging/search?q=teklif').expect(200)).body.items.some((i: { message: { id: string } }) => i.message.id === open.id));
    });

    await t.test('knowledge suggestion: knowledge writers get a draft card with clean PDF/images; others cannot', async () => {
      const project = await db.conversation.findFirstOrThrow({ where: { kind: 'CHANNEL', name: 'teknik' } });
      for (const s of [tech, salesA]) await call(s, 'post', `/messaging/conversations/${project.id}/join`).expect(201);
      const brochure = (await upload(tech, project.id, 'Broşür.pdf', pdf).expect(201)).body;
      const notes = (await upload(tech, project.id, 'notlar.txt', Buffer.from('ham notlar')).expect(201)).body;
      await db.messageAttachment.updateMany({ where: { id: { in: [brochure.id, notes.id] } }, data: { scanStatus: 'CLEAN', scannedAt: new Date() } });
      const m = (await post(tech, project.id, 'Firewall kurulumunda port 443 açık kalmalı', { attachmentIds: [brochure.id, notes.id] }).expect(201)).body;
      await call(salesA, 'post', `/messaging/messages/${m.id}/knowledge`, { title: 'Firewall', category: 'Ağ' }).expect(403);
      assert.equal((await call(tech, 'get', `/messaging/conversations/${project.id}`).expect(200)).body.canSuggestKnowledge, true);
      const result = (await call(tech, 'post', `/messaging/messages/${m.id}/knowledge`, { title: 'Firewall kurulum notu', category: 'Ağ' }).expect(201)).body;
      assert.deepEqual([result.attached, result.skipped], [['Broşür.pdf'], ['notlar.txt']]);
      const article = await db.knowledgeArticle.findUniqueOrThrow({ where: { id: result.articleId }, include: { versions: true, attachments: true } });
      assert.equal(article.versions[0]!.status, 'DRAFT'); assert.equal(article.versions[0]!.summary, 'Firewall kurulumunda port 443 açık kalmalı');
      assert.equal(article.attachments.length, 1); assert.equal(article.publishedVersionId, null);
      await call(salesA, 'get', `/knowledge/${result.articleId}`).expect(404);
    });

    await t.test('retention removes text, history and files of old channel/group/direct messages; record conversations stay', async () => {
      const old = new Date(Date.now() - 800 * 86_400_000);
      const oldDm = await backdated(dm.id, salesA.id, 'İki yıldan eski birebir', old);
      const oldChannel = await backdated(genel.id, salesB.id, 'Eski kanal mesajı', old);
      await db.messageRevision.create({ data: { messageId: oldDm.id, body: 'Daha da eski metin', createdAt: old } });
      const draft = (await upload(salesA, dm.id, 'eski-ek.pdf', Buffer.from('%PDF-1.4 retention')).expect(201)).body;
      await db.messageAttachment.update({ where: { id: draft.id }, data: { messageId: oldDm.id } });
      const fileKey = (await db.messageAttachment.findUniqueOrThrow({ where: { id: draft.id } })).fileKey;
      const company = (await call(salesA, 'post', '/companies', { displayName: 'P8C Saklama', legalName: 'P8C Saklama AŞ' }).expect(201)).body;
      const record = (await call(salesA, 'post', '/messaging/record-conversations', { recordType: 'COMPANY', recordId: company.id }).expect(201)).body;
      const oldRecord = await backdated(record.id, salesA.id, 'Kayıtla birlikte saklanır', old);
      const recent = (await post(salesA, dm.id, 'Yeni mesaj').expect(201)).body;
      assert.ok(existsSync(resolve(files.root(), fileKey)));

      const run = await app.get(MessageRetentionService).purge();
      assert.ok(run.messages >= 2); assert.ok(run.files >= 1);
      for (const id of [oldDm.id, oldChannel.id]) {
        const row = await db.message.findUniqueOrThrow({ where: { id } });
        assert.equal(row.body, ''); assert.ok(row.expiredAt);
      }
      assert.equal(await db.messageRevision.count({ where: { messageId: oldDm.id } }), 0);
      assert.ok((await db.messageAttachment.findUniqueOrThrow({ where: { id: draft.id } })).removedAt);
      assert.ok(!existsSync(resolve(files.root(), fileKey)));
      await request(app.getHttpServer()).get(`/api/v1/messaging/attachments/${draft.id}`).set('Cookie', salesB.cookie).expect(404);
      assert.equal((await db.message.findUniqueOrThrow({ where: { id: oldRecord.id } })).body, 'Kayıtla birlikte saklanır');
      assert.equal((await db.message.findUniqueOrThrow({ where: { id: recent.id } })).body, 'Yeni mesaj');
      const listed = (await messages(salesB, dm.id)).find(x => x.id === oldDm.id)!;
      assert.deepEqual([listed.state, listed.body], ['EXPIRED', '']);
      assert.ok(await db.auditLog.findFirst({ where: { action: 'MESSAGE_RETENTION' } }));
      assert.deepEqual(await app.get(MessageRetentionService).purge(), { messages: 0, files: 0 });
      await assert.rejects(db.message.update({ where: { id: oldDm.id }, data: { expiredAt: null } }));
    });
  } finally {
    await db.rateLimit.deleteMany({});
    await app.close();
  }
});
