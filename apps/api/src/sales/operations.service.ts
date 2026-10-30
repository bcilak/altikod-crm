import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { companySchema, handoffSchema, reportSchema } from '@saleshub/shared';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { PrismaService } from '../prisma.service';
import { Actor, digest } from '../security/access';
import { assignable, audit, companyScope, requireCompany } from '../security/policy';
import { decimal } from './money';
import { Prisma } from '../generated/prisma/client';
import { scheduleTask } from '../crm/work.service';
import { ListQuery, paging } from '../crm/companies.service';

type Filters = z.infer<typeof reportSchema>;
const serial = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const csvSafe = (value: unknown) => typeof value === 'string' && /^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value;
@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}
  private scope(actor: Actor, f: Filters): Prisma.OpportunityWhereInput {
    return { company: { AND: [companyScope(actor), ...(f.sector ? [{ sector: f.sector }] : [])] }, ...(f.ownerId ? { ownerId: f.ownerId } : {}), ...(f.product ? { products: { has: f.product } } : {}) };
  }
  async overview(actor: Actor, f: Filters) {
    const from = f.from ? new Date(f.from) : new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)); const to = f.to ? new Date(f.to) : new Date();
    const scope = this.scope(actor, f); const period = { gte: from, lte: to };
    return this.prisma.$transaction(async db => {
      const [pipeline, closed, newCompanies, sentQuotes, pendingQuotes, overdueTasks, activities] = await Promise.all([
        db.opportunity.findMany({ where: { AND: [scope, { company: { archivedAt: null }, stage: { notIn: ['WON', 'LOST'] } }] }, select: { estimatedValue: true, currency: true, probability: true, nextActionAt: true } }),
        db.opportunity.findMany({ where: { AND: [scope, { OR: [{ stage: 'WON', wonAt: period }, { stage: 'LOST', lostAt: period }] }] }, select: { stage: true, currency: true, estimatedValue: true } }),
        db.company.count({ where: { AND: [companyScope(actor), { createdAt: period, ...(f.ownerId ? { ownerId: f.ownerId } : {}), ...(f.sector ? { sector: f.sector } : {}) }] } }),
        db.quoteVersion.count({ where: { sentAt: period, quote: { opportunity: scope } } }),
        db.quoteVersion.count({ where: { status: 'PENDING_APPROVAL', quote: { opportunity: scope } } }),
        db.task.count({ where: { company: { AND: [companyScope(actor), { archivedAt: null }, ...(f.sector ? [{ sector: f.sector }] : [])] }, ...(f.ownerId ? { assigneeId: f.ownerId } : {}), ...(f.product ? { opportunity: { products: { has: f.product } } } : {}), status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { lt: new Date() } } }),
        db.activity.count({ where: { company: { AND: [companyScope(actor), ...(f.sector ? [{ sector: f.sector }] : [])] }, happenedAt: period, ...(f.ownerId ? { createdBy: f.ownerId } : {}), ...(f.product ? { opportunity: { products: { has: f.product } } } : {}) } }),
      ]);
      const currencies: Record<string, { pipeline: string; weighted: string; won: string }> = {};
      const ensure = (key: string) => currencies[key] ??= { pipeline: '0.00', weighted: '0.00', won: '0.00' };
      for (const o of pipeline) { const bucket = ensure(o.currency); bucket.pipeline = decimal(bucket.pipeline).plus(o.estimatedValue.toString()).toFixed(4); bucket.weighted = decimal(bucket.weighted).plus(decimal(o.estimatedValue.toString()).mul(o.probability).div(100)).toFixed(6); }
      for (const o of closed.filter(o => o.stage === 'WON')) { const bucket = ensure(o.currency); bucket.won = decimal(bucket.won).plus(o.estimatedValue.toString()).toFixed(4); }
      const won = closed.filter(o => o.stage === 'WON').length; const lost = closed.length - won;
      return { period: { from: from.toISOString(), to: to.toISOString() }, newCompanies, sentQuotes, pendingQuotes, overdueTasks, activities, openOpportunities: pipeline.length, overdueFollowups: pipeline.filter(o => o.nextActionAt < new Date()).length, won, lost, winRate: closed.length ? decimal(won).div(closed.length).mul(100).toFixed(2) : null, currencies, definitions: { pipeline: 'Şu an açık fırsatlar; dönem filtresi uygulanmaz.', winRate: 'Seçili dönemde kapanan WON / (WON + LOST).', sentQuotes: 'Seçili dönemde gönderildi işaretlenen teklif sürümleri.', newCompanies: 'Dönemde açılan firmalar; ürün filtresi uygulanmaz.' } };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async export(actor: Actor, kind: 'companies' | 'opportunities', f: Filters) {
    const rows = kind === 'companies' ? await this.prisma.company.findMany({ where: { AND: [companyScope(actor), { archivedAt: null, ...(f.ownerId ? { ownerId: f.ownerId } : {}), ...(f.sector ? { sector: f.sector } : {}), ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lte: new Date(f.to) } : {}) } } : {}) }] }, take: 10001, orderBy: { id: 'asc' }, select: { displayName: true, legalName: true, domain: true, sector: true, phone: true } }) : await this.prisma.opportunity.findMany({ where: { AND: [this.scope(actor, f), ...(f.from || f.to ? [{ createdAt: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lte: new Date(f.to) } : {}) } }] : [])] }, take: 10001, orderBy: { id: 'asc' }, select: { title: true, stage: true, estimatedValue: true, currency: true, probability: true, nextActionAt: true } });
    if (rows.length > 10000) throw new BadRequestException('Dışa aktarımı filtrelerle 10.000 kaydın altına indirin');
    await audit(this.prisma, actor.id, 'CSV_EXPORT', kind, undefined, { count: rows.length });
    const columns = kind === 'companies' ? ['displayName', 'legalName', 'domain', 'sector', 'phone'] : ['title', 'stage', 'estimatedValue', 'currency', 'probability', 'nextActionAt'];
    return '\uFEFF' + stringify(rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, csvSafe(value instanceof Date ? value.toISOString() : value && typeof value === 'object' ? value.toString() : value)]))), { header: true, columns });
  }
  async preview(actor: Actor, csv: string) {
    let raw: Record<string, string>[];
    try { raw = parse(csv.replace(/^\uFEFF/, ''), { columns: true, skip_empty_lines: true, max_record_size: 10000, trim: true }) as Record<string, string>[]; } catch { throw new BadRequestException('CSV biçimi geçersiz; virgül ayracı ve başlık satırı gerekli'); }
    if (!raw.length || raw.length > 500) throw new BadRequestException('Bir aktarım 1–500 satır içermeli');
    const rows: z.infer<typeof companySchema>[] = []; const errors: { row: number; message: string }[] = []; const keys = new Set<string>();
    for (const [i, r] of raw.entries()) {
      if (Object.keys(r).some(key => !['displayName', 'legalName', 'domain', 'sector', 'phone'].includes(key))) { errors.push({ row: i + 2, message: 'Desteklenmeyen sütun; örnek şablonu kullanın' }); continue; }
      const parsed = companySchema.safeParse({ displayName: r.displayName, legalName: r.legalName, domain: r.domain || null, sector: r.sector || null, phone: r.phone || null });
      if (!parsed.success) { errors.push({ row: i + 2, message: parsed.error.issues.map(e => e.path.join('.')).join(', ') + ' alanlarını kontrol edin' }); continue; }
      const row = parsed.data; const key = row.legalName.toLocaleLowerCase('tr-TR');
      const duplicate = keys.has(key) || row.domain && keys.has(`domain:${row.domain}`) || await this.prisma.company.findFirst({ where: { AND: [companyScope(actor), { OR: [{ legalName: { equals: row.legalName, mode: 'insensitive' } }, ...(row.domain ? [{ domain: row.domain }] : [])] }] }, select: { id: true } });
      if (duplicate) errors.push({ row: i + 2, message: 'Mükerrer kayıt; aktarım öncesinde düzeltin' });
      keys.add(key); if (row.domain) keys.add(`domain:${row.domain}`); rows.push(row);
    }
    const batch = await this.prisma.importBatch.create({ data: { userId: actor.id, rows: serial(rows), errors: serial(errors), expiresAt: new Date(Date.now() + 15 * 60_000) } });
    return { id: batch.id, rows, errors, expiresAt: batch.expiresAt, canConfirm: errors.length === 0 };
  }
  async confirm(actor: Actor, id: string) {
    return this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT id FROM "ImportBatch" WHERE id = ${id}::uuid AND "userId" = ${actor.id}::uuid FOR UPDATE`;
      const batch = await db.importBatch.findFirst({ where: { id, userId: actor.id } });
      if (!batch) throw new NotFoundException();
      if (batch.completedAt) return { ids: batch.resultIds, repeated: true };
      if (batch.expiresAt <= new Date() || (batch.errors as unknown[]).length) throw new ConflictException('Önizleme süresi dolmuş veya hatalı');
      const ids: string[] = [];
      for (const input of batch.rows as unknown as z.infer<typeof companySchema>[]) {
        if (await db.company.findFirst({ where: { AND: [companyScope(actor), { OR: [{ legalName: { equals: input.legalName, mode: 'insensitive' } }, ...(input.domain ? [{ domain: input.domain }] : [])] }] } })) throw new ConflictException('Önizlemeden sonra mükerrer kayıt oluştu; yeniden önizleyin');
        const company = await db.company.create({ data: { ...input, ownerId: actor.id } }); ids.push(company.id);
      }
      await db.importBatch.update({ where: { id }, data: { completedAt: new Date(), resultIds: ids } });
      await audit(db, actor.id, 'CSV_IMPORT', 'import_batch', id, { count: ids.length });
      return { ids, repeated: false };
    }, { isolationLevel: 'Serializable', timeout: 30_000 });
  }
  async handoffs(actor: Actor, q: ListQuery) {
    const where = { company: companyScope(actor), ...(q.opportunityId ? { opportunityId: q.opportunityId } : {}) };
    const [items, total] = await this.prisma.$transaction([this.prisma.handoff.findMany({ where, ...paging(q), orderBy: { createdAt: 'desc' }, include: { company: { select: { displayName: true } }, opportunity: { select: { title: true } }, project: { select: { id: true, status: true } } } }), this.prisma.handoff.count({ where })]);
    return { items, total };
  }
  async handoff(actor: Actor, opportunityId: string, input: z.infer<typeof handoffSchema>) {
    return this.prisma.$transaction(async db => {
      const opportunity = await db.opportunity.findFirst({ where: { id: opportunityId, company: companyScope(actor, true) } });
      if (!opportunity) throw new NotFoundException();
      await requireCompany(db, actor, opportunity.companyId, true);
      await db.$queryRaw`SELECT id FROM "Opportunity" WHERE id = ${opportunityId}::uuid FOR UPDATE`;
      const current = await db.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
      if (current.stage !== 'WON') throw new ConflictException('Yalnız kazanılmış fırsat devredilir');
      const requestHash = digest(JSON.stringify(input));
      const existing = await db.handoff.findUnique({ where: { opportunityId } });
      if (existing) { if (existing.requestHash !== requestHash) throw new ConflictException('Bu fırsat zaten farklı bilgilerle devredilmiş'); return { ...existing, projectId: (await db.project.findUniqueOrThrow({ where: { handoffId: existing.id } })).id }; }
      await assignable(db, input.ownerId, current.companyId, true);
      const accepted = current.acceptedQuoteVersionId ? await db.quoteVersion.findUniqueOrThrow({ where: { id: current.acceptedQuoteVersionId } }) : null;
      const task = await db.task.create({ data: { companyId: current.companyId, opportunityId, assigneeId: input.ownerId, title: `İş devri: ${current.title}`, description: input.summary, dueAt: input.dueAt, priority: 'HIGH', createdBy: actor.id } });
      await scheduleTask(db, task, true);
      const result = await db.handoff.create({ data: { opportunityId, companyId: current.companyId, ownerId: input.ownerId, summary: input.summary, contractUrl: input.contractUrl, acceptedQuoteVersionId: accepted?.id, taskId: task.id, requestHash, createdBy: actor.id, snapshot: serial({ opportunityTitle: current.title, manualWinReason: accepted ? null : current.wonReason, quote: accepted?.snapshot ?? null }) } });
      // Phase 6: the handoff opens the delivery project; its first task belongs to the project.
      const project = await db.project.create({ data: { opportunityId, companyId: current.companyId, handoffId: result.id, ownerId: input.ownerId, title: current.title, dueAt: input.dueAt, createdBy: actor.id } });
      await db.task.update({ where: { id: task.id }, data: { projectId: project.id } });
      await audit(db, actor.id, 'HANDOFF_CREATE', 'handoff', result.id, { projectId: project.id });
      return { ...result, projectId: project.id };
    });
  }
}
