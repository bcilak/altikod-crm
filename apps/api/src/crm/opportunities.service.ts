import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { opportunitySchema, opportunityPatchSchema, transitionSchema } from '@saleshub/shared';
import { PrismaService } from '../prisma.service';
import { Actor, isManager } from '../security/access';
import { assignable, audit, companyScope, requireCompany } from '../security/policy';
import { ListQuery, paging } from './companies.service';

@Injectable()
export class OpportunitiesService {
  constructor(private readonly prisma: PrismaService) {}
  async list(actor: Actor, q: ListQuery) {
    const where = { company: { AND: [companyScope(actor), { archivedAt: null }] }, ...(q.companyId ? { companyId: q.companyId } : {}), ...(q.ownerId ? { ownerId: q.ownerId } : {}), ...(q.stage ? { stage: q.stage } : {}), ...(q.search ? { title: { contains: q.search, mode: 'insensitive' as const } } : {}), ...(q.overdue === 'true' ? { AND: [{ nextActionAt: { lt: new Date() } }, { stage: { notIn: ['WON', 'LOST'] as ('WON' | 'LOST')[] } }] } : {}) };
    const [items, total] = await this.prisma.$transaction([this.prisma.opportunity.findMany({ where, ...paging(q), orderBy: { updatedAt: 'desc' }, include: { company: { select: { id: true, displayName: true } }, owner: { select: { id: true, name: true } } } }), this.prisma.opportunity.count({ where })]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async get(actor: Actor, id: string) {
    const row = await this.prisma.opportunity.findFirst({ where: { id, company: companyScope(actor) }, include: { history: { orderBy: { changedAt: 'desc' } }, company: { select: { id: true, displayName: true, archivedAt: true } }, owner: { select: { id: true, name: true } } } });
    if (!row) throw new NotFoundException('Fırsat bulunamadı');
    return { ...row, canWrite: !row.company.archivedAt && !!await this.prisma.company.findFirst({ where: { AND: [{ id: row.companyId }, companyScope(actor, true)] } }) };
  }
  async create(actor: Actor, input: z.infer<typeof opportunitySchema>) {
    return this.prisma.$transaction(async db => {
      await requireCompany(db, actor, input.companyId, true);
      const ownerId = input.ownerId ?? actor.id;
      await assignable(db, ownerId, input.companyId);
      const row = await db.opportunity.create({ data: { ...input, ownerId, history: { create: { toStage: 'NEW_LEAD', changedBy: actor.id } } } });
      await audit(db, actor.id, 'CREATE', 'opportunity', row.id);
      return row;
    });
  }
  async update(actor: Actor, id: string, input: z.infer<typeof opportunityPatchSchema>) {
    return this.prisma.$transaction(async db => {
      const row = await db.opportunity.findFirst({ where: { id, company: companyScope(actor, true) } });
      if (!row) throw new NotFoundException();
      await requireCompany(db, actor, row.companyId, true);
      if (['WON', 'LOST'].includes(row.stage)) throw new ConflictException('Önce fırsatı yeniden açın');
      if (input.ownerId) await assignable(db, input.ownerId, row.companyId);
      const { version, ...data } = input;
      const result = await db.opportunity.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
      if (result.count !== 1) throw new ConflictException('Kayıt değişti; yenileyip tekrar deneyin');
      await audit(db, actor.id, 'UPDATE', 'opportunity', id, { fields: Object.keys(data) });
      return db.opportunity.findUniqueOrThrow({ where: { id } });
    });
  }
  async transition(actor: Actor, id: string, input: z.infer<typeof transitionSchema>) {
    return this.prisma.$transaction(async db => {
      const row = await db.opportunity.findFirst({ where: { id, company: companyScope(actor, true) } });
      if (!row) throw new NotFoundException();
      await requireCompany(db, actor, row.companyId, true);
      if (row.version !== input.version) throw new ConflictException('Kayıt değişti; yenileyin');
      if (row.stage === input.stage) throw new BadRequestException('Fırsat zaten bu aşamada');
      const closed = ['WON', 'LOST'].includes(row.stage);
      const targetClosed = ['WON', 'LOST'].includes(input.stage);
      if (closed && row.acceptedQuoteVersionId) throw new ConflictException('Kabul edilen teklifli fırsat yeniden açılamaz; sözleşme değişikliği ayrı süreçtir');
      if (closed && (targetClosed || !isManager(actor) || !input.reason || !input.nextActionAt)) throw new BadRequestException('Yeniden açma için yönetici, gerekçe ve sonraki aksiyon gerekli');
      if (input.stage === 'LOST' && !input.reason) throw new BadRequestException('Kayıp nedeni zorunlu');
      if (input.stage === 'WON') {
        if (!isManager(actor)) throw new ForbiddenException('Manuel kazanım yalnız yönetici tarafından yapılır; satış kullanıcıları teklif kabul akışını kullanır');
        if (!input.reason) throw new BadRequestException('Manuel kazanım gerekçesi zorunlu');
      }
      const result = await db.opportunity.updateMany({ where: { id, version: input.version }, data: {
        stage: input.stage, version: { increment: 1 }, ...(input.nextActionAt ? { nextActionAt: input.nextActionAt } : {}),
        wonAt: input.stage === 'WON' ? new Date() : null, lostAt: input.stage === 'LOST' ? new Date() : null,
        lostReason: input.stage === 'LOST' ? input.reason : null, wonReason: input.stage === 'WON' ? input.reason : null,
      } });
      if (result.count !== 1) throw new ConflictException('Eşzamanlı değişiklik; yenileyin');
      await db.stageHistory.create({ data: { opportunityId: id, fromStage: row.stage, toStage: input.stage, changedBy: actor.id, note: input.reason } });
      await audit(db, actor.id, 'STAGE_CHANGE', 'opportunity', id, { from: row.stage, to: input.stage });
      return db.opportunity.findUniqueOrThrow({ where: { id } });
    });
  }
}
