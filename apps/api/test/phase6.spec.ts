import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { hashPassword } from '../src/auth/auth.service';
import { configureApp } from '../src/http';
import { Role } from '../src/generated/prisma/client';

type Session = { cookie: string; csrf: string; id: string };
const origin = 'http://localhost:3000';
test('Phase 6: delivery projects, knowledge base and academy', async t => {
  if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.startsWith('/saleshub_test_')) throw new Error('Isolated database required');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; process.env.NODE_ENV = 'test';
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication(); configureApp(app); await app.init(); const db = app.get(PrismaService);
  const call = (s: Session, method: 'get' | 'post' | 'patch', path: string, body?: object) => {
    const r = request(app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', s.cookie).set('Origin', origin).set('X-CSRF-Token', s.csrf); return body ? r.send(body) : r;
  };
  const upload = (s: Session, articleId: string, name: string, bytes: Buffer) => request(app.getHttpServer()).post(`/api/v1/knowledge/${articleId}/attachments?name=${encodeURIComponent(name)}`).set('Cookie', s.cookie).set('Origin', origin).set('X-CSRF-Token', s.csrf).set('Content-Type', 'application/octet-stream').send(bytes);
  const login = async (role: Role, name: string): Promise<Session> => {
    const email = `p6-${name}@example.invalid`; const password = 'Test-only-password!42';
    await db.user.create({ data: { name, email, role, passwordHash: await hashPassword(password) } });
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', origin).send({ email, password }).expect(201);
    return { cookie: (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!, csrf: r.body.csrfToken, id: r.body.user.id };
  };
  try {
    const admin = await login('ADMIN', 'admin'); const sales = await login('SALES', 'sales'); const other = await login('SALES', 'other');
    const tech = await login('TECHNICAL', 'tech'); const tech2 = await login('TECHNICAL', 'tech2'); const viewer = await login('VIEWER', 'viewer');

    let projectId = '';
    await t.test('handoff opens exactly one project; concurrent requests are idempotent', async () => {
      const company = (await call(sales, 'post', '/companies', { displayName: 'P6 Firma', legalName: 'P6 Firma AŞ' }).expect(201)).body;
      const opp = (await call(sales, 'post', '/opportunities', { companyId: company.id, title: 'P6 Ağ kurulumu', estimatedValue: '5000', currency: 'TRY', probability: 60, nextActionAt: '2030-01-01T00:00:00Z' }).expect(201)).body;
      await call(admin, 'post', `/opportunities/${opp.id}/stage-transitions`, { stage: 'WON', version: opp.version, reason: 'Sözlü onay ve sipariş yazısı' }).expect(201);
      const body = { ownerId: tech.id, summary: 'Ofis ağının kurulumu ve firewall devreye alma', dueAt: '2030-02-01T09:00:00Z', contractUrl: 'https://contracts.example.invalid/p6' };
      const [first, second] = await Promise.all([call(sales, 'post', `/handoffs/from-opportunity/${opp.id}`, body), call(sales, 'post', `/handoffs/from-opportunity/${opp.id}`, body)]);
      assert.deepEqual([first.status, second.status], [201, 201]);
      assert.equal(first.body.projectId, second.body.projectId);
      assert.equal(await db.project.count({ where: { opportunityId: opp.id } }), 1);
      const handoffTask = await db.task.findUniqueOrThrow({ where: { id: first.body.taskId } });
      assert.equal(handoffTask.projectId, first.body.projectId);
      projectId = first.body.projectId;
    });

    await t.test('project visibility follows scope; technicians never receive commercial data', async () => {
      const forSales = (await call(sales, 'get', `/projects/${projectId}`).expect(200)).body;
      assert.equal(forSales.commercial.contractUrl, 'https://contracts.example.invalid/p6');
      assert.equal(forSales.canWrite, true);
      const forTech = (await call(tech, 'get', `/projects/${projectId}`).expect(200)).body;
      assert.equal(forTech.commercial, undefined);
      assert.doesNotMatch(JSON.stringify(forTech), /contracts\.example|wonReason|Sözlü onay|estimatedValue/);
      assert.equal(forTech.summary, 'Ofis ağının kurulumu ve firewall devreye alma');
      await call(other, 'get', `/projects/${projectId}`).expect(404);
      await call(tech2, 'get', `/projects/${projectId}`).expect(404);
      await call(viewer, 'get', `/projects/${projectId}`).expect(404);
      assert.equal((await call(other, 'get', '/projects').expect(200)).body.total, 0);
      await call(viewer, 'patch', `/projects/${projectId}`, { version: 1, title: 'x' }).expect(403);
    });

    await t.test('owner technician plans work; assignees see but cannot manage the project', async () => {
      const milestone = (await call(tech, 'post', `/projects/${projectId}/milestones`, { title: 'Keşif tamamlandı', dueAt: '2030-01-15T09:00:00Z' }).expect(201)).body;
      assert.equal(milestone.position, 0);
      const task = (await call(tech, 'post', `/projects/${projectId}/tasks`, { assigneeId: tech2.id, title: 'Firewall kurulumu', dueAt: '2030-01-20T09:00:00Z' }).expect(201)).body;
      assert.equal(task.projectId, projectId);
      await call(tech, 'post', `/projects/${projectId}/tasks`, { assigneeId: viewer.id, title: 'Geçersiz', dueAt: '2030-01-20T09:00:00Z' }).expect(403);
      const seen = (await call(tech2, 'get', `/projects/${projectId}`).expect(200)).body;
      assert.equal(seen.canWrite, false);
      await call(tech2, 'post', `/projects/${projectId}/milestones`, { title: 'x', dueAt: '2030-01-15T09:00:00Z' }).expect(403);
      await call(tech, 'patch', `/projects/${projectId}`, { version: 1, ownerId: tech2.id }).expect(403);
      assert.equal((await call(tech2, 'get', '/projects').expect(200)).body.total, 1);
    });

    await t.test('status rules: completion needs closed milestones and tasks; stale versions conflict', async () => {
      let project = (await call(tech, 'get', `/projects/${projectId}`).expect(200)).body;
      await call(tech, 'patch', `/projects/${projectId}`, { version: project.version, status: 'COMPLETED' }).expect(409);
      project = (await call(tech, 'patch', `/projects/${projectId}`, { version: project.version, status: 'IN_PROGRESS' }).expect(200)).body;
      assert.ok(project.startAt);
      await call(tech, 'patch', `/projects/${projectId}`, { version: project.version - 1, title: 'Eski' }).expect(409);
      const blocked = await call(tech, 'patch', `/projects/${projectId}`, { version: project.version, status: 'COMPLETED' }).expect(409);
      assert.match(blocked.body.error.message, /1 kilometre taşı ve 2 açık görev/);
      const detail = (await call(tech, 'get', `/projects/${projectId}`).expect(200)).body;
      await call(tech, 'patch', `/project-milestones/${detail.milestones[0].id}`, { completed: true }).expect(200);
      for (const task of detail.tasks) {
        const owner = task.assignee.id === tech.id ? tech : tech2;
        await call(owner, 'patch', `/tasks/${task.id}`, { version: task.version, status: 'DONE' }).expect(200);
      }
      const done = (await call(tech, 'patch', `/projects/${projectId}`, { version: project.version, status: 'COMPLETED' }).expect(200)).body;
      assert.ok(done.completedAt);
      await call(tech, 'post', `/projects/${projectId}/milestones`, { title: 'Geç', dueAt: '2030-03-01T09:00:00Z' }).expect(409);
      const reopened = (await call(sales, 'patch', `/projects/${projectId}`, { version: done.version, status: 'IN_PROGRESS' }).expect(200)).body;
      assert.equal(reopened.completedAt, null);
      await call(sales, 'patch', `/projects/${projectId}`, { version: reopened.version, status: 'PLANNED' }).expect(409);
      const audits = await db.auditLog.count({ where: { entity: 'project', entityId: projectId, action: 'PROJECT_STATUS' } });
      assert.equal(audits, 3);
    });

    const pdf = Buffer.from('%PDF-1.4\n% Altıkod test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
    const content = { summary: 'Kurumsal firewall', technicalSpecs: '10 Gbps', useCases: 'Şube güvenliği', idealCustomer: '50+ çalışan', salesPitch: 'Tek panelden yönetim', limitations: 'Bulut sürümü yok', discoveryQuestions: ['Kaç şube var?'], objections: [{ objection: 'Pahalı', answer: 'TCO karşılaştırması' }], faq: [{ question: 'Lisans süresi?', answer: '1 yıl' }] };
    let articleId = ''; let attachmentId = '';
    await t.test('drafts and their attachments are invisible to sales; uploads are type- and size-checked', async () => {
      const product = (await call(admin, 'post', '/products', { sku: 'P6-FW', name: 'P6 Firewall', category: 'Güvenlik', description: 'Firewall', status: 'APPROVED', listPrice: '100', currency: 'USD' }).expect(201)).body;
      await call(sales, 'post', '/knowledge', { title: 'x', category: 'y', content: { summary: 'z' } }).expect(403);
      const article = (await call(tech, 'post', '/knowledge', { title: 'P6 Firewall bilgi kartı', category: 'Güvenlik', tags: ['firewall'], productId: product.id, content }).expect(201)).body;
      articleId = article.id;
      assert.equal((await call(sales, 'get', '/knowledge').expect(200)).body.total, 0);
      await call(sales, 'get', `/knowledge/${articleId}`).expect(404);
      const attachment = (await upload(tech, articleId, 'Teknik föy.pdf', pdf).expect(201)).body;
      attachmentId = attachment.id; assert.equal(attachment.mimeType, 'application/pdf');
      await call(sales, 'get', `/knowledge-attachments/${attachmentId}`).expect(404);
      await upload(tech, articleId, 'virus.pdf', Buffer.from('MZ not really a pdf')).expect(400);
      await upload(tech, articleId, '../etc/passwd.pdf', pdf).expect(400);
      await upload(tech, articleId, 'C:\\temp\\a.pdf', pdf).expect(400);
      await upload(tech, articleId, 'huge.pdf', Buffer.concat([pdf, Buffer.alloc(5 * 1024 * 1024)])).expect(413);
      await upload(sales, articleId, 'x.pdf', pdf).expect(403);
    });

    await t.test('review workflow publishes immutable versions; revisions stay hidden until published', async () => {
      let detail = (await call(tech, 'get', `/knowledge/${articleId}`).expect(200)).body;
      const v1 = detail.openVersion;
      await call(tech, 'post', `/knowledge-versions/${v1.id}/publish`, { lockVersion: v1.lockVersion }).expect(403);
      const submitted = (await call(tech, 'post', `/knowledge-versions/${v1.id}/submit`, { lockVersion: v1.lockVersion }).expect(201)).body;
      await call(tech, 'patch', `/knowledge-versions/${v1.id}`, { ...content, lockVersion: submitted.lockVersion }).expect(409);
      await call(admin, 'post', `/knowledge-versions/${v1.id}/reject`, { lockVersion: submitted.lockVersion }).expect(400);
      const rejected = (await call(admin, 'post', `/knowledge-versions/${v1.id}/reject`, { lockVersion: submitted.lockVersion, note: 'Fiyat bilgisi çıkarılsın' }).expect(201)).body;
      assert.equal(rejected.status, 'DRAFT'); assert.equal(rejected.reviewNote, 'Fiyat bilgisi çıkarılsın');
      const again = (await call(tech, 'post', `/knowledge-versions/${v1.id}/submit`, { lockVersion: rejected.lockVersion }).expect(201)).body;
      await call(admin, 'post', `/knowledge-versions/${v1.id}/publish`, { lockVersion: again.lockVersion }).expect(201);
      const read = (await call(sales, 'get', `/knowledge/${articleId}`).expect(200)).body;
      assert.equal(read.published.summary, 'Kurumsal firewall'); assert.equal(read.canEdit, false); assert.equal(read.history, undefined);
      const file = await call(sales, 'get', `/knowledge-attachments/${attachmentId}`).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); }).expect(200);
      assert.ok(Buffer.compare(file.body as Buffer, pdf) === 0);
      assert.equal(file.headers['content-type'], 'application/pdf');
      assert.match(String(file.headers['content-disposition']), /^attachment; .*filename\*=UTF-8''Teknik%20f%C3%B6y\.pdf$/);
      await assert.rejects(db.knowledgeVersion.update({ where: { id: v1.id }, data: { summary: 'Sessizce değişti' } }), /immutable/);
      await assert.rejects(db.knowledgeVersion.delete({ where: { id: v1.id } }), /cannot be deleted/);

      const v2 = (await call(admin, 'post', `/knowledge/${articleId}/versions`).expect(201)).body;
      assert.equal(v2.version, 2); assert.equal(v2.summary, 'Kurumsal firewall');
      await call(admin, 'post', `/knowledge/${articleId}/versions`).expect(409);
      const edited = (await call(admin, 'patch', `/knowledge-versions/${v2.id}`, { ...content, summary: 'Kurumsal firewall v2', lockVersion: v2.lockVersion }).expect(200)).body;
      assert.equal((await call(sales, 'get', `/knowledge/${articleId}`).expect(200)).body.published.summary, 'Kurumsal firewall');
      const v2submitted = (await call(admin, 'post', `/knowledge-versions/${v2.id}/submit`, { lockVersion: edited.lockVersion }).expect(201)).body;
      await call(admin, 'post', `/knowledge-versions/${v2.id}/publish`, { lockVersion: v2submitted.lockVersion }).expect(201);
      assert.equal((await call(sales, 'get', `/knowledge/${articleId}`).expect(200)).body.published.summary, 'Kurumsal firewall v2');
      assert.equal((await db.knowledgeVersion.findUniqueOrThrow({ where: { id: v1.id } })).status, 'SUPERSEDED');
      detail = (await call(admin, 'get', `/knowledge/${articleId}`).expect(200)).body;
      assert.deepEqual(detail.history.map((h: { status: string }) => h.status), ['PUBLISHED', 'SUPERSEDED']);
      const list = (await call(sales, 'get', `/knowledge?productId=${detail.product.id}`).expect(200)).body;
      assert.equal(list.total, 1); assert.equal(list.openVersion, undefined);
    });

    await t.test('retired articles disappear for readers together with their files', async () => {
      await call(sales, 'post', `/knowledge/${articleId}/retire`).expect(403);
      await call(admin, 'post', `/knowledge/${articleId}/retire`).expect(201);
      await call(sales, 'get', `/knowledge/${articleId}`).expect(404);
      await call(sales, 'get', `/knowledge-attachments/${attachmentId}`).expect(404);
      assert.equal((await call(sales, 'get', '/knowledge').expect(200)).body.total, 0);
      await call(admin, 'post', `/knowledge/${articleId}/restore`).expect(201);
      await call(sales, 'get', `/knowledge/${articleId}`).expect(200);
    });

    await t.test('academy grades on the server and never sends the answer key to learners', async () => {
      const draftArticle = (await call(tech, 'post', '/knowledge', { title: 'Yayınlanmamış', category: 'Güvenlik', content: { summary: 'gizli' } }).expect(201)).body;
      const course = (await call(admin, 'post', '/courses', { title: 'Firewall satışı 101', description: 'Temel eğitim' }).expect(201)).body;
      await call(sales, 'post', '/courses', { title: 'x' }).expect(403);
      const lesson = (await call(admin, 'post', `/courses/${course.id}/lessons`, { title: 'İtiraz karşılama', body: 'TCO anlatımı', articleId: draftArticle.id, passPct: 100, questions: [{ prompt: 'TCO nedir?', options: ['Vergi', 'Toplam sahip olma maliyeti'], correctIndex: 1 }, { prompt: 'Ürün hangi segmente uygun?', options: ['50+ çalışan', 'Ev kullanıcısı'], correctIndex: 0 }] }).expect(201)).body;
      await call(admin, 'post', `/courses/${course.id}/lessons`, { title: 'Hatalı', body: 'x', questions: [{ prompt: 'q', options: ['a', 'b'], correctIndex: 2 }] }).expect(400);
      await call(sales, 'get', `/courses/${course.id}`).expect(404);
      await call(sales, 'post', `/lessons/${lesson.id}/attempts`, { answers: [1, 0] }).expect(404);
      const published = (await call(admin, 'patch', `/courses/${course.id}`, { version: course.version, status: 'PUBLISHED' }).expect(200)).body;
      await call(admin, 'post', `/courses/${course.id}/lessons`, { title: 'Sonradan', body: 'x' }).expect(409);
      const learnerView = (await call(sales, 'get', `/courses/${course.id}`).expect(200)).body;
      assert.doesNotMatch(JSON.stringify(learnerView), /correctIndex/);
      assert.equal(learnerView.lessons[0].article, null);
      assert.equal(learnerView.lessons[0].questions.length, 2);
      assert.equal((await call(admin, 'get', `/courses/${course.id}`).expect(200)).body.lessons[0].questions[0].correctIndex, 1);
      await call(sales, 'post', `/lessons/${lesson.id}/attempts`, { answers: [1] }).expect(400);
      const failed = (await call(sales, 'post', `/lessons/${lesson.id}/attempts`, { answers: [1, 1] }).expect(201)).body;
      assert.deepEqual(failed, { score: 50, passed: false, passPct: 100, attempts: 1, completed: false });
      const passed = (await call(sales, 'post', `/lessons/${lesson.id}/attempts`, { answers: [1, 0] }).expect(201)).body;
      assert.equal(passed.completed, true);
      const afterFail = (await call(sales, 'post', `/lessons/${lesson.id}/attempts`, { answers: [0, 1] }).expect(201)).body;
      assert.equal(afterFail.completed, true);
      const progress = await db.lessonProgress.findFirstOrThrow({ where: { userId: sales.id, lessonId: lesson.id } });
      assert.equal(progress.bestScore, 100); assert.equal(progress.attempts, 3);
      assert.equal(await db.lessonProgress.count({ where: { userId: other.id } }), 0);
      const list = (await call(sales, 'get', '/courses').expect(200)).body;
      assert.equal(list.items[0].completedLessons, 1); assert.equal(list.canManage, false);
      await call(sales, 'get', '/academy/progress').expect(403);
      const report = (await call(admin, 'get', '/academy/progress').expect(200)).body;
      const row = report.courses[0].learners.find((l: { userId: string }) => l.userId === sales.id);
      assert.equal(row.completed, 1); assert.equal(report.courses[0].lessonCount, 1);
      await call(admin, 'patch', `/courses/${course.id}`, { version: published.version, status: 'DRAFT' }).expect(200);
      await call(sales, 'get', `/courses/${course.id}`).expect(404);
    });
  } finally { await app.close(); }
});
