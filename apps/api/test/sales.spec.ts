import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { hashPassword } from '../src/auth/auth.service';
import { configureApp } from '../src/http';
import { SalesJobs } from '../src/sales/sales-jobs.service';
type Session = { cookie: string; csrf: string; id: string };
test('Phases 4–5: quotes, immutable artifacts, imports, reports and handoff', async t => {
  if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.startsWith('/saleshub_test_')) throw new Error('Isolated database required');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication(); configureApp(app); await app.init(); const db = app.get(PrismaService);
  const call = (s: Session, method: 'get' | 'post' | 'patch', path: string, body?: object) => {
    const r = request(app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', s.cookie).set('Origin', 'http://localhost:3000').set('X-CSRF-Token', s.csrf); return body ? r.send(body) : r;
  };
  const login = async (role: 'ADMIN' | 'SALES' | 'TECHNICAL', name: string): Promise<Session> => {
    const email = `phase45-${name}@example.invalid`; const password = 'Test-only-password!42';
    await db.user.create({ data: { name, email, role, passwordHash: await hashPassword(password) } });
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', 'http://localhost:3000').send({ email, password }).expect(201);
    return { cookie: (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!, csrf: r.body.csrfToken, id: r.body.user.id };
  };
  try {
    const admin = await login('ADMIN', 'admin'); const sales = await login('SALES', 'sales'); const other = await login('SALES', 'other'); const tech = await login('TECHNICAL', 'tech');
    const company = (await call(sales, 'post', '/companies', { displayName: '=FORMULA()', legalName: 'Phase45 Company', sector: 'Phase45' }).expect(201)).body;
    const opportunity = (await call(sales, 'post', '/opportunities', { companyId: company.id, title: 'Phase45 Deal', estimatedValue: '1000', currency: 'USD', probability: 50, nextActionAt: '2030-01-01T00:00:00Z' }).expect(201)).body;
    const productBody = { sku: 'PH45', name: 'Firewall', category: 'Security', description: 'Firewall service', status: 'APPROVED', listPrice: '100', cost: '40', currency: 'USD' };
    const product = (await call(admin, 'post', '/products', productBody).expect(201)).body;
    const body = { opportunityId: opportunity.id, title: 'Phase45 Quote', currency: 'USD', validUntil: '2030-01-01T00:00:00Z', discountPct: '10', terms: 'Test terms', items: [{ productId: product.id, description: 'Firewall service', quantity: '2', unitPrice: '100', discountPct: '0', taxPct: '20' }] };
    let quote = (await call(sales, 'post', '/quotes', body).expect(201)).body;
    const id = quote.versions[0].id; let pdfHash = '';
    await t.test('cost fields and private records are protected on every endpoint', async () => {
      assert.equal(quote.versions[0].total, '216'); assert.equal(quote.versions[0].costTotal, undefined); assert.equal(quote.versions[0].items[0].unitCost, undefined);
      const p = await call(sales, 'get', `/products/${product.id}`).expect(200); assert.equal(p.body.cost, undefined);
      await call(sales, 'post', '/products', productBody).expect(403);
      await call(sales, 'post', '/quotes', { ...body, items: [{ ...body.items[0], unitCost: '1' }] }).expect(403);
      await call(other, 'get', `/quotes/${quote.id}`).expect(404); await call(other, 'get', `/quote-versions/${id}/pdf`).expect(404);
      await call(tech, 'get', '/quotes').expect(403); await call(sales, 'post', `/quote-versions/${id}/approve`, { lockVersion: 1 }).expect(403);
    });
    await t.test('manual approval is mandatory by default and freezes content in PostgreSQL', async () => {
      quote = (await call(sales, 'post', `/quote-versions/${id}/request-approval`, { lockVersion: 1 }).expect(201)).body;
      assert.equal(quote.versions[0].status, 'PENDING_APPROVAL');
      await assert.rejects(db.quoteVersion.update({ where: { id }, data: { title: 'Tamper' } }));
      await assert.rejects(db.quoteVersion.update({ where: { id }, data: { status: 'DRAFT' } }));
      await assert.rejects(db.quoteItem.update({ where: { id: quote.versions[0].items[0].id }, data: { unitPrice: '1' } }));
      const race = await Promise.all([call(admin, 'post', `/quote-versions/${id}/approve`, { lockVersion: 2 }), call(admin, 'post', `/quote-versions/${id}/approve`, { lockVersion: 2 })]);
      assert.deepEqual(race.map(r => r.status).sort(), [201, 409]);
      await call(sales, 'post', `/quote-versions/${id}/send`, { lockVersion: 3 }).expect(409);
    });
    await t.test('PDF bytes remain identical after master-data updates and concurrent revision', async () => {
      const pdf = await call(sales, 'get', `/quote-versions/${id}/pdf`).expect(200); assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
      pdfHash = createHash('sha256').update(pdf.body).digest('hex');
      await call(admin, 'patch', `/products/${product.id}`, { listPrice: '200', cost: '90' }).expect(200);
      await call(sales, 'patch', `/companies/${company.id}`, { legalName: 'Changed company' }).expect(200);
      const race = await Promise.all([call(sales, 'post', `/quotes/${quote.id}/versions`, { sourceVersionId: id, expectedCurrentVersion: 1 }), call(sales, 'post', `/quotes/${quote.id}/versions`, { sourceVersionId: id, expectedCurrentVersion: 1 })]);
      assert.deepEqual(race.map(r => r.status).sort(), [201, 409]);
      const again = await call(sales, 'get', `/quote-versions/${id}/pdf`).expect(200); assert.equal(createHash('sha256').update(again.body).digest('hex'), pdfHash);
      await call(sales, 'post', `/quote-versions/${id}/send`, { lockVersion: 3 }).expect(201);
    });
    await t.test('customer acceptance atomically closes the opportunity and cannot be repeated', async () => {
      const race = await Promise.all([call(sales, 'post', `/quote-versions/${id}/accept`, { lockVersion: 4, note: 'Customer order received' }), call(sales, 'post', `/quote-versions/${id}/accept`, { lockVersion: 4, note: 'Customer order received' })]);
      assert.deepEqual(race.map(r => r.status).sort(), [201, 409]);
      const o = await db.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } }); assert.equal(o.stage, 'WON'); assert.equal(o.acceptedQuoteVersionId, id);
      await call(admin, 'post', `/opportunities/${o.id}/stage-transitions`, { stage: 'NEGOTIATION', version: o.version, reason: 'Reopen', nextActionAt: '2030-01-01T00:00:00Z' }).expect(409);
      await call(sales, 'post', `/quotes/${quote.id}/versions`, { sourceVersionId: id, expectedCurrentVersion: 2 }).expect(409);
    });
    await t.test('handoff concurrency creates exactly one task and hides commercial detail from technician', async () => {
      const handoff = { ownerId: tech.id, summary: 'Install the firewall', dueAt: '2030-01-01T00:00:00Z' };
      const race = await Promise.all([call(sales, 'post', `/handoffs/from-opportunity/${opportunity.id}`, handoff), call(sales, 'post', `/handoffs/from-opportunity/${opportunity.id}`, handoff)]);
      assert.deepEqual(race.map(r => r.status), [201, 201]); assert.equal(race[0]!.body.taskId, race[1]!.body.taskId);
      const task = await call(tech, 'get', `/tasks/${race[0]!.body.taskId}`).expect(200); assert.equal(task.body.description, handoff.summary); assert.equal(task.body.opportunityId, undefined);
      await call(tech, 'get', '/handoffs').expect(403);
    });
    await t.test('CSV preview is read-only, errors block commits, confirmation is idempotent and scoped', async () => {
      const bad = await call(sales, 'post', '/imports/companies/preview', { csv: 'displayName,legalName\nOne,Same\nTwo,Same' }).expect(201); assert.equal(bad.body.canConfirm, false);
      await call(sales, 'post', `/imports/companies/${bad.body.id}/confirm`).expect(409);
      const before = await db.company.count();
      const good = await call(sales, 'post', '/imports/companies/preview', { csv: 'displayName,legalName,domain\nCSV Firm,CSV Unique,csv.example.invalid' }).expect(201);
      assert.equal(await db.company.count(), before); await call(other, 'post', `/imports/companies/${good.body.id}/confirm`).expect(404);
      const first = await call(sales, 'post', `/imports/companies/${good.body.id}/confirm`).expect(201);
      const again = await call(sales, 'post', `/imports/companies/${good.body.id}/confirm`).expect(201); assert.deepEqual(first.body.ids, again.body.ids); assert.equal(again.body.repeated, true);
      const csv = await call(sales, 'get', '/exports/companies').expect(200); assert.ok(csv.text.includes("'=FORMULA()"));
      const hidden = await call(other, 'get', '/exports/companies').expect(200); assert.ok(!hidden.text.includes('FORMULA'));
    });
    await t.test('report scope, currency separation and win rate use real records', async () => {
      const report = await call(sales, 'get', '/reports/overview?sector=Phase45').expect(200); assert.equal(report.body.won, 1); assert.equal(report.body.winRate, '100.00'); assert.equal(report.body.currencies.USD.won, '1000.0000');
      const hidden = await call(other, 'get', '/reports/overview?sector=Phase45').expect(200); assert.equal(hidden.body.won, 0); assert.equal(hidden.body.winRate, null);
    });
    await t.test('expiry worker is idempotent for an overdue pending version', async () => {
      const draft = await db.quoteVersion.findFirstOrThrow({ where: { quoteId: quote.id, status: 'DRAFT' } });
      await db.quoteVersion.update({ where: { id: draft.id }, data: { validUntil: new Date('2020-01-01'), status: 'PENDING_APPROVAL' } });
      await app.get(SalesJobs).tick(); await app.get(SalesJobs).tick();
      assert.equal((await db.quoteVersion.findUniqueOrThrow({ where: { id: draft.id } })).status, 'EXPIRED');
      assert.equal(await db.quoteEvent.count({ where: { quoteVersionId: draft.id, toStatus: 'EXPIRED' } }), 1);
    });
    await t.test('configured thresholds auto-approve only known margin; customer rejection keeps opportunity open', async () => {
      const settings = await db.salesSettings.findUniqueOrThrow({ where: { id: 'default' } });
      await call(admin, 'patch', '/settings/sales', { sellerName: 'Updated seller', sellerAddress: '', sellerEmail: '', defaultTerms: '', autoApproval: true, maxDiscountPct: '20', minMarginPct: '30', revision: settings.revision }).expect(200);
      const open = (await call(sales, 'post', '/opportunities', { companyId: company.id, title: 'Policy test', estimatedValue: '200', currency: 'EUR', probability: 25, nextActionAt: '2030-01-01T00:00:00Z' }).expect(201)).body;
      const input = { ...body, opportunityId: open.id, items: [{ ...body.items[0], unitCost: '40' }] };
      const known = (await call(admin, 'post', '/quotes', input).expect(201)).body;
      const v = known.versions[0];
      const approved = await call(admin, 'post', `/quote-versions/${v.id}/request-approval`, { lockVersion: 1 }).expect(201); assert.equal(approved.body.versions[0].status, 'APPROVED'); assert.equal(approved.body.versions[0].approvalMethod, 'POLICY');
      await call(admin, 'get', `/quote-versions/${v.id}/pdf`).expect(200);
      await call(admin, 'post', `/quote-versions/${v.id}/send`, { lockVersion: 2 }).expect(201);
      await call(admin, 'post', `/quote-versions/${v.id}/reject`, { lockVersion: 3, note: 'Budget not approved' }).expect(201);
      assert.equal((await db.opportunity.findUniqueOrThrow({ where: { id: open.id } })).stage, 'NEW_LEAD');
      const unknown = (await call(admin, 'post', '/quotes', { ...input, items: [{ ...input.items[0], unitCost: null }] }).expect(201)).body;
      const pending = await call(admin, 'post', `/quote-versions/${unknown.versions[0].id}/request-approval`, { lockVersion: 1 }).expect(201); assert.equal(pending.body.versions[0].status, 'PENDING_APPROVAL');
      const oldPdf = await call(sales, 'get', `/quote-versions/${id}/pdf`).expect(200); assert.equal(createHash('sha256').update(oldPdf.body).digest('hex'), pdfHash);
      const timeline = await call(sales, 'get', `/companies/${company.id}/timeline`).expect(200); assert.ok(timeline.body.items.some((i: { type: string }) => i.type === 'QUOTE')); assert.ok(timeline.body.items.some((i: { type: string }) => i.type === 'HANDOFF'));
    });
  } finally { await app.close(); }
});
