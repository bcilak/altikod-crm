import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { configureApp } from '../src/http';
import { parseEnv } from '../src/env';
import { paginationSchema, companyPatchSchema, taskPatchSchema, opportunityPatchSchema, meetingPatchSchema, contactPatchSchema } from '@saleshub/shared';
import { ZodValidationPipe } from '../src/validation.pipe';
process.env.NODE_ENV = 'test';

test('environment rejects missing database and invalid port without exposing secrets', () => {
  assert.throws(() => parseEnv({ PORT: '0' }), /Invalid environment fields/);
  assert.throws(() => parseEnv({ DATABASE_URL: 'secret-value' }), error => error instanceof Error && !error.message.includes('secret-value'));
  assert.equal(parseEnv({ DATABASE_URL: 'postgresql://localhost/test' }).PORT, 3001);
});

test('pagination rejects unbounded requests', () => {
  assert.equal(paginationSchema.parse({}).pageSize, 25);
  assert.equal(paginationSchema.safeParse({ pageSize: 101 }).success, false);
  const pipe = new ZodValidationPipe(paginationSchema);
  assert.deepEqual(pipe.transform({ page: '2' }), { page: 2, pageSize: 25 });
  assert.throws(() => pipe.transform({ page: '-1' }), /Invalid request fields/);
});

test('PATCH contracts never inject omitted create defaults', () => {
  assert.deepEqual(companyPatchSchema.parse({ sector: 'IT' }), { sector: 'IT' });
  assert.deepEqual(contactPatchSchema.parse({ title: 'CTO' }), { title: 'CTO' });
  assert.deepEqual(meetingPatchSchema.parse({ notes: 'Done' }), { notes: 'Done' });
  assert.deepEqual(taskPatchSchema.parse({ status: 'DONE', version: 1 }), { status: 'DONE', version: 1 });
  assert.deepEqual(opportunityPatchSchema.parse({ title: 'Revised', version: 1 }), { title: 'Revised', version: 1 });
});

test('HTTP liveness, readiness, redacted errors and OpenAPI contract', async () => {
  let available = true;
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue({
    systemMetadata: { findUnique: async () => { if (!available) throw new Error('sensitive-database-credentials'); return { value: 'phase-0' }; } },
    rolePermission: { findUnique: async () => ({ role: 'ADMIN' }) },
  }).compile();
  const app = module.createNestApplication();
  configureApp(app);
  await app.init();
  try {
    const health = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    assert.deepEqual(health.body, { status: 'ok', service: 'saleshub-api' });
    assert.ok(health.headers['x-request-id']);
    await request(app.getHttpServer()).get('/api/v1/ready').expect(200);
    available = false;
    const unavailable = await request(app.getHttpServer()).get('/api/v1/ready').expect(503);
    assert.equal(unavailable.body.error.code, 'SERVICE_UNAVAILABLE');
    assert.ok(!JSON.stringify(unavailable.body).includes('sensitive-database-credentials'));
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    const missing = await request(app.getHttpServer()).get('/api/v1/not-implemented').expect(404);
    assert.equal(missing.body.error.code, 'NOT_FOUND');
    const docs = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    assert.ok(docs.body.paths['/api/v1/health']);
    assert.ok(docs.body.paths['/api/v1/ready']);
    assert.ok(docs.body.paths['/api/v1/companies'].post.requestBody.content['application/json'].schema.properties.legalName);
  } finally { await app.close(); }
});
