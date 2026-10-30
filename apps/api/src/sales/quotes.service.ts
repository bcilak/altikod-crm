import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { quoteActionSchema, quoteContentSchema, quoteCreateSchema, quoteEditSchema, quoteRevisionSchema } from '@saleshub/shared';
import { PrismaService } from '../prisma.service';
import { Actor, isManager } from '../security/access';
import { audit, companyScope, Db, requireCompany } from '../security/policy';
import { Prisma, QuoteStatus, QuoteItem } from '../generated/prisma/client';
import { CatalogService, financeAccess } from './catalog.service';
import { calculateQuote, decimal, QuoteInput } from './money';
import { FilesService, QuoteSnapshot } from './files.service';
import { ListQuery, paging } from '../crm/companies.service';

const include = { items: { orderBy: { position: 'asc' as const } }, events: { orderBy: { createdAt: 'asc' as const } } };
const serial = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
const quoteNumber = (number: number) => `SH-${String(number).padStart(6, '0')}`;
@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService, private readonly catalog: CatalogService, private readonly files: FilesService) {}
  async list(actor: Actor, q: ListQuery) {
    const where: Prisma.QuoteWhereInput = { company: companyScope(actor), ...(q.companyId ? { companyId: q.companyId } : {}), ...(q.opportunityId ? { opportunityId: q.opportunityId } : {}), ...(q.search ? { versions: { some: { title: { contains: q.search, mode: 'insensitive' } } } } : {}) };
    const [items, total] = await this.prisma.$transaction([this.prisma.quote.findMany({ where, ...paging(q), orderBy: { createdAt: 'desc' }, include: { company: { select: { displayName: true } }, versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { id: true, title: true, status: true, total: true, currency: true, validUntil: true } } } }), this.prisma.quote.count({ where })]);
    return { items: items.map(q => ({ ...q, quoteNumber: quoteNumber(q.number) })), total };
  }
  async get(actor: Actor, id: string) {
    const quote = await this.prisma.quote.findFirst({ where: { id, company: companyScope(actor) }, include: { versions: { orderBy: { versionNumber: 'desc' }, include }, company: { select: { displayName: true, archivedAt: true } } } });
    if (!quote) throw new NotFoundException('Teklif bulunamadı');
    const finance = await financeAccess(this.prisma, actor);
    const opportunity = await this.prisma.opportunity.findUniqueOrThrow({ where: { id: quote.opportunityId }, select: { stage: true } });
    const canRevise = !['WON', 'LOST'].includes(opportunity.stage);
    const canWrite = !quote.company.archivedAt && !!await this.prisma.company.findFirst({ where: { AND: [{ id: quote.companyId }, companyScope(actor, true)] } });
    return { ...quote, quoteNumber: quoteNumber(quote.number), canWrite, canRevise, canFinance: finance, canApprove: isManager(actor), versions: quote.versions.map(v => ({ ...v, costTotal: finance ? v.costTotal : undefined, marginPct: finance ? v.marginPct : undefined, policySnapshot: finance ? v.policySnapshot : undefined, pdfKey: undefined, items: v.items.map(i => ({ ...i, unitCost: finance ? i.unitCost : undefined })), events: v.events.map(e => ({ ...e, note: finance || ['ACCEPTED', 'REJECTED'].includes(e.toStatus) ? e.note : undefined })) })) };
  }
  private async prepared(db: Db, actor: Actor, input: QuoteInput, previous: QuoteItem[] = [], internal = false) {
    const finance = internal || await financeAccess(db, actor);
    const items = [];
    for (const [i, line] of input.items.entries()) {
      if (line.unitCost !== undefined && !finance) throw new ForbiddenException('Maliyet değiştirme izni yok');
      const product = line.productId ? await db.product.findUnique({ where: { id: line.productId } }) : null;
      if (line.productId && (!product || product.status !== 'APPROVED' && !isManager(actor))) throw new BadRequestException('Ürün kullanıma açık değil');
      if (product && product.currency !== input.currency) throw new BadRequestException('Ürün ve teklif para birimi eşleşmeli');
      const old = previous[i];
      const retained = old && (old.productId ?? null) === (line.productId ?? null) && old.description === line.description ? old.unitCost?.toString() : undefined;
      items.push({ ...line, unitCost: line.unitCost === undefined ? retained ?? product?.cost?.toString() ?? null : line.unitCost });
    }
    return { ...input, items };
  }
  private async content(db: Db, input: QuoteInput, companyId: string, number: number, version: number) {
    const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });
    const settings = await db.salesSettings.findUniqueOrThrow({ where: { id: 'default' } });
    const calc = calculateQuote(input);
    const snapshot: QuoteSnapshot = { template: 'saleshub-v1', number: quoteNumber(number), version, title: input.title, currency: input.currency, validUntil: input.validUntil, terms: input.terms || settings.defaultTerms, seller: { name: settings.sellerName, address: settings.sellerAddress, email: settings.sellerEmail }, company: { name: company.legalName, address: company.address ?? '' }, lines: calc.lines.map(l => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, taxPct: l.taxPct, net: l.net, tax: l.tax, total: l.total })), subtotal: calc.subtotal, discountTotal: calc.discountTotal, taxTotal: calc.taxTotal, total: calc.total };
    return { data: { title: input.title, currency: input.currency, validUntil: new Date(input.validUntil), terms: snapshot.terms, discountPct: input.discountPct, subtotal: calc.subtotal, discountTotal: calc.discountTotal, taxTotal: calc.taxTotal, total: calc.total, costTotal: calc.costTotal, marginPct: calc.marginPct, snapshot: serial(snapshot) }, lines: calc.lines.map(l => ({ ...l, productId: l.productId ?? null })) };
  }
  async create(actor: Actor, input: z.infer<typeof quoteCreateSchema>) {
    const { opportunityId, ...body } = input;
    await this.catalog.settings();
    const id = await this.prisma.$transaction(async db => {
      const opportunity = await db.opportunity.findFirst({ where: { id: opportunityId, company: companyScope(actor, true) } });
      if (!opportunity) throw new NotFoundException();
      await requireCompany(db, actor, opportunity.companyId, true);
      if (['WON', 'LOST'].includes(opportunity.stage)) throw new ConflictException('Kapalı fırsata yeni teklif açılamaz');
      const quote = await db.quote.create({ data: { companyId: opportunity.companyId, opportunityId: opportunity.id, createdBy: actor.id } });
      const prepared = await this.prepared(db, actor, quoteContentSchema.parse(body));
      const content = await this.content(db, prepared, quote.companyId, quote.number, 1);
      await db.quoteVersion.create({ data: { ...content.data, quoteId: quote.id, versionNumber: 1, createdBy: actor.id, items: { create: content.lines }, events: { create: { toStatus: 'DRAFT', actorId: actor.id } } } });
      await audit(db, actor.id, 'QUOTE_CREATE', 'quote', quote.id);
      return quote.id;
    });
    return this.get(actor, id);
  }
  private async locked(db: Db, actor: Actor, versionId: string, write = true) {
    const initial = await db.quoteVersion.findFirst({ where: { id: versionId, quote: { company: companyScope(actor, write) } }, select: { quoteId: true } });
    if (!initial) throw new NotFoundException('Teklif sürümü bulunamadı');
    await db.$queryRaw`SELECT id FROM "Quote" WHERE id = ${initial.quoteId}::uuid FOR UPDATE`;
    const row = await db.quoteVersion.findUniqueOrThrow({ where: { id: versionId }, include: { ...include, quote: true } });
    await requireCompany(db, actor, row.quote.companyId, write);
    return row;
  }
  async edit(actor: Actor, id: string, input: z.infer<typeof quoteEditSchema>) {
    const { lockVersion, ...body } = input;
    const quoteId = await this.prisma.$transaction(async db => {
      const row = await this.locked(db, actor, id);
      if (row.status !== 'DRAFT' || row.lockVersion !== lockVersion || row.quote.currentVersion !== row.versionNumber) throw new ConflictException('Taslak değişti veya kilitli');
      const prepared = await this.prepared(db, actor, body, row.items);
      const content = await this.content(db, prepared, row.quote.companyId, row.quote.number, row.versionNumber);
      await db.quoteItem.deleteMany({ where: { quoteVersionId: id } });
      await db.quoteVersion.update({ where: { id }, data: { ...content.data, lockVersion: { increment: 1 }, items: { create: content.lines } } });
      await audit(db, actor.id, 'QUOTE_DRAFT_UPDATE', 'quote_version', id);
      return row.quoteId;
    });
    return this.get(actor, quoteId);
  }
  async revise(actor: Actor, quoteId: string, input: z.infer<typeof quoteRevisionSchema>) {
    await this.prisma.$transaction(async db => {
      const source = await this.locked(db, actor, input.sourceVersionId);
      if (source.quoteId !== quoteId || source.quote.currentVersion !== input.expectedCurrentVersion) throw new ConflictException('Teklif değişti; yenileyin');
      const opportunity = await db.opportunity.findUniqueOrThrow({ where: { id: source.quote.opportunityId } });
      if (['WON', 'LOST'].includes(opportunity.stage) || opportunity.acceptedQuoteVersionId) throw new ConflictException('Kabul edilmiş/kapalı fırsatta revizyon açılamaz');
      const current = await db.quoteVersion.findUniqueOrThrow({ where: { quoteId_versionNumber: { quoteId, versionNumber: source.quote.currentVersion } } });
      if (current.status === 'DRAFT') {
        await db.quoteVersion.update({ where: { id: current.id }, data: { status: 'WITHDRAWN', lockVersion: { increment: 1 } } });
        await db.quoteEvent.create({ data: { quoteVersionId: current.id, fromStatus: 'DRAFT', toStatus: 'WITHDRAWN', actorId: actor.id } });
      }
      const version = source.quote.currentVersion + 1;
      const snapshot = { ...(source.snapshot as object), version };
      await db.quoteVersion.create({ data: { quoteId, versionNumber: version, title: source.title, currency: source.currency, validUntil: source.validUntil, terms: source.terms, discountPct: source.discountPct, subtotal: source.subtotal, discountTotal: source.discountTotal, taxTotal: source.taxTotal, total: source.total, costTotal: source.costTotal, marginPct: source.marginPct, snapshot: serial(snapshot), createdBy: actor.id, items: { create: source.items.map(i => ({ productId: i.productId, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, discountPct: i.discountPct, taxPct: i.taxPct, unitCost: i.unitCost, net: i.net, tax: i.tax, total: i.total, position: i.position })) }, events: { create: { toStatus: 'DRAFT', actorId: actor.id } } } });
      await db.quote.update({ where: { id: quoteId }, data: { currentVersion: version } });
      await audit(db, actor.id, 'QUOTE_REVISE', 'quote', quoteId, { version });
    });
    return this.get(actor, quoteId);
  }
  async action(actor: Actor, id: string, action: 'request-approval' | 'approve' | 'send' | 'accept' | 'reject' | 'withdraw', input: z.infer<typeof quoteActionSchema>) {
    const quoteId = await this.prisma.$transaction(async db => {
      const row = await this.locked(db, actor, id);
      if (row.lockVersion !== input.lockVersion) throw new ConflictException('Sürüm durumu değişti; yenileyin');
      if (['request-approval', 'approve', 'send'].includes(action)) {
        await db.$queryRaw`SELECT id FROM "Opportunity" WHERE id = ${row.quote.opportunityId}::uuid FOR UPDATE`;
        const opportunity = await db.opportunity.findUniqueOrThrow({ where: { id: row.quote.opportunityId } });
        if (['WON', 'LOST'].includes(opportunity.stage)) throw new ConflictException('Kapalı fırsat için teklif onaylanamaz veya gönderilemez');
      }
      const data: Prisma.QuoteVersionUpdateInput = { lockVersion: { increment: 1 } };
      let target: QuoteStatus;
      if (action === 'request-approval') {
        if (row.status !== 'DRAFT' || row.quote.currentVersion !== row.versionNumber) throw new ConflictException('Yalnız güncel taslak onaya gönderilir');
        if (row.validUntil <= new Date()) throw new BadRequestException('Geçerlilik tarihi gelecekte olmalı');
        const policy = await db.salesSettings.findUniqueOrThrow({ where: { id: 'default' } });
        const effective = calculateQuote({ title: row.title, currency: row.currency as QuoteInput['currency'], validUntil: row.validUntil.toISOString(), terms: row.terms, discountPct: row.discountPct.toString(), items: row.items.map(i => ({ description: i.description, quantity: i.quantity.toString(), unitPrice: i.unitPrice.toString(), discountPct: i.discountPct.toString(), taxPct: i.taxPct.toString(), unitCost: i.unitCost?.toString() ?? null })) }).effectiveDiscount;
        const automatic = policy.autoApproval && row.marginPct !== null && decimal(row.marginPct.toString()).gte(policy.minMarginPct.toString()) && decimal(effective).lte(policy.maxDiscountPct.toString());
        data.policySnapshot = serial({ revision: policy.revision, autoApproval: policy.autoApproval, maxDiscountPct: policy.maxDiscountPct.toString(), minMarginPct: policy.minMarginPct.toString() });
        target = automatic ? 'APPROVED' : 'PENDING_APPROVAL';
        if (automatic) { data.approvalMethod = 'POLICY'; data.approvedAt = new Date(); }
        else {
          const reviewers = await db.user.findMany({ where: { isActive: true, role: { in: ['ADMIN', 'MANAGER'] } }, select: { id: true } });
          for (const reviewer of reviewers) await db.notification.upsert({ where: { dedupeKey: `approval:${id}:${reviewer.id}` }, create: { userId: reviewer.id, quoteVersionId: id, type: 'QUOTE_APPROVAL', dedupeKey: `approval:${id}:${reviewer.id}` }, update: {} });
        }
      } else if (action === 'approve') {
        if (!isManager(actor)) throw new ForbiddenException('Yönetici onayı gerekli');
        if (row.status !== 'PENDING_APPROVAL' || row.validUntil <= new Date()) throw new ConflictException('Sürüm onaylanabilir durumda değil');
        target = 'APPROVED'; data.approvalMethod = 'MANAGER'; data.approvedBy = actor.id; data.approvedAt = new Date();
      } else if (action === 'send') {
        if (row.status !== 'APPROVED' || row.validUntil <= new Date() || !row.pdfKey) throw new ConflictException('Önce onay ve sabit PDF gerekli; teklif geçerli olmalı');
        target = 'SENT'; data.sentAt = new Date();
      } else if (action === 'accept') {
        if (row.status !== 'SENT' || row.validUntil <= new Date() || !input.note) throw new BadRequestException('Gönderilmiş/geçerli teklif ve müşteri kabul dayanağı gerekli');
        await db.$queryRaw`SELECT id FROM "Opportunity" WHERE id = ${row.quote.opportunityId}::uuid FOR UPDATE`;
        const opportunity = await db.opportunity.findUniqueOrThrow({ where: { id: row.quote.opportunityId } });
        if (opportunity.acceptedQuoteVersionId || ['WON', 'LOST'].includes(opportunity.stage)) throw new ConflictException('Fırsat kapalı veya başka sürüm kabul edilmiş');
        await db.opportunity.update({ where: { id: opportunity.id }, data: { stage: 'WON', acceptedQuoteVersionId: id, wonAt: new Date(), wonReason: 'Müşteri teklif kabulü', lostAt: null, lostReason: null, version: { increment: 1 } } });
        await db.stageHistory.create({ data: { opportunityId: opportunity.id, fromStage: opportunity.stage, toStage: 'WON', changedBy: actor.id, note: `Teklif ${quoteNumber(row.quote.number)} V${row.versionNumber} kabul edildi` } });
        target = 'ACCEPTED'; data.acceptedAt = new Date(); data.acceptanceNote = input.note;
      } else if (action === 'reject') {
        if (row.status !== 'SENT' || !input.note) throw new BadRequestException('Müşteri reddi için gönderilmiş teklif ve gerekçe gerekli');
        target = 'REJECTED';
      } else {
        if (['ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'].includes(row.status)) throw new ConflictException('Bu sürüm geri çekilemez');
        target = 'WITHDRAWN';
      }
      await db.quoteVersion.update({ where: { id }, data: { ...data, status: target } });
      await db.quoteEvent.create({ data: { quoteVersionId: id, fromStatus: row.status, toStatus: target, actorId: actor.id, note: input.note } });
      await audit(db, actor.id, 'QUOTE_STATUS', 'quote_version', id, { from: row.status, to: target, method: action === 'send' ? 'MANUAL_RECORD' : action });
      return row.quoteId;
    });
    return this.get(actor, quoteId);
  }
  async pdf(actor: Actor, id: string) {
    return this.prisma.$transaction(async db => {
      const row = await this.locked(db, actor, id, false);
      if (row.status === 'DRAFT') throw new ConflictException('Taslak PDF sabit değildir; önce onaya gönderin');
      if (row.pdfKey && row.pdfChecksum) return { bytes: await this.files.read(row.pdfKey, row.pdfChecksum), name: `${quoteNumber(row.quote.number)}-V${row.versionNumber}.pdf` };
      const pdf = await this.files.createPdf(row.snapshot as unknown as QuoteSnapshot);
      await db.quoteVersion.update({ where: { id }, data: { pdfKey: pdf.key, pdfChecksum: pdf.checksum } });
      await audit(db, actor.id, 'PDF_CREATE', 'quote_version', id, { checksum: pdf.checksum });
      return { bytes: pdf.bytes, name: `${quoteNumber(row.quote.number)}-V${row.versionNumber}.pdf` };
    }, { timeout: 60_000, maxWait: 10_000 });
  }
}
