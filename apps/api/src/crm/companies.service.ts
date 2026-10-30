import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { companySchema, companyPatchSchema, contactSchema, contactPatchSchema, listSchema } from '@saleshub/shared';
import { PrismaService } from '../prisma.service';
import { Actor, isManager } from '../security/access';
import { audit, companyScope, requireCompany } from '../security/policy';

export type ListQuery = z.infer<typeof listSchema>;
export const paging = (q: ListQuery) => ({ take: q.pageSize, skip: (q.page - 1) * q.pageSize });
@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}
  async list(actor: Actor, q: ListQuery) {
    const where = { AND: [companyScope(actor), { archivedAt: q.archived === 'true' ? { not: null } : null,
      ...(q.ownerId ? { ownerId: q.ownerId } : {}), ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { OR: [{ displayName: { contains: q.search, mode: 'insensitive' as const } }, { legalName: { contains: q.search, mode: 'insensitive' as const } }, { domain: { contains: q.search, mode: 'insensitive' as const } }] } : {}),
    }] };
    const [items, total] = await this.prisma.$transaction([this.prisma.company.findMany({ where, ...paging(q), orderBy: q.sort === 'name' ? { displayName: 'asc' } : { createdAt: q.sort === 'oldest' ? 'asc' : 'desc' }, include: { owner: { select: { id: true, name: true } } } }), this.prisma.company.count({ where })]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async get(actor: Actor, id: string) {
    const company = await requireCompany(this.prisma, actor, id);
    const contacts = await this.prisma.contact.findMany({ where: { companyId: id, archivedAt: null }, orderBy: { firstName: 'asc' } });
    const canWrite = !company.archivedAt && !!await this.prisma.company.findFirst({ where: { AND: [{ id }, companyScope(actor, true)] } });
    return { ...company, contacts, canWrite, canShare: isManager(actor) || company.ownerId === actor.id };
  }
  async create(actor: Actor, input: z.infer<typeof companySchema>) {
    return this.prisma.$transaction(async db => {
      const duplicates = await db.company.findMany({ where: { AND: [companyScope(actor), { archivedAt: null, OR: [{ legalName: { equals: input.legalName, mode: 'insensitive' } }, ...(input.domain ? [{ domain: input.domain }] : [])] }] }, select: { id: true, displayName: true }, take: 10 });
      const company = await db.company.create({ data: { ...input, ownerId: actor.id } });
      await audit(db, actor.id, 'CREATE', 'company', company.id);
      return { ...company, duplicateWarnings: duplicates };
    });
  }
  async update(actor: Actor, id: string, input: z.infer<typeof companyPatchSchema>) {
    return this.prisma.$transaction(async db => {
      const previous = await requireCompany(db, actor, id, true);
      if (input.ownerId) {
        if (!isManager(actor)) throw new ForbiddenException('Sorumlu değişikliği yönetici işlemi');
        if (!await db.user.findFirst({ where: { id: input.ownerId, isActive: true, role: { in: ['ADMIN', 'MANAGER', 'SALES'] } } })) throw new BadRequestException('Geçersiz sorumlu');
      }
      const company = await db.company.update({ where: { id }, data: input });
      await audit(db, actor.id, 'UPDATE', 'company', id, { fields: Object.keys(input), previousOwnerId: previous.ownerId, ownerId: company.ownerId });
      return company;
    });
  }
  async archive(actor: Actor, id: string, archived: boolean) {
    return this.prisma.$transaction(async db => {
      const company = await requireCompany(db, actor, id);
      if (!isManager(actor) && company.ownerId !== actor.id) throw new ForbiddenException('Yalnız firma sahibi veya yönetici arşivleyebilir');
      const result = await db.company.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
      await audit(db, actor.id, archived ? 'ARCHIVE' : 'RESTORE', 'company', id);
      return result;
    });
  }
  async shares(actor: Actor, id: string) {
    const company = await requireCompany(this.prisma, actor, id);
    if (!isManager(actor) && company.ownerId !== actor.id) throw new ForbiddenException();
    return this.prisma.companyAccess.findMany({ where: { companyId: id }, include: { user: { select: { id: true, name: true, role: true } } } });
  }
  async share(actor: Actor, id: string, userId: string, permission: 'READ' | 'WRITE' | 'NONE') {
    return this.prisma.$transaction(async db => {
      const company = await requireCompany(db, actor, id, true);
      if (!isManager(actor) && company.ownerId !== actor.id) throw new ForbiddenException('Paylaşım yalnız sahip veya yönetici tarafından yapılır');
      const target = await db.user.findFirst({ where: { id: userId, isActive: true, role: { not: 'TECHNICAL' } } });
      if (!target || target.role === 'VIEWER' && permission === 'WRITE') throw new BadRequestException('Geçersiz paylaşım');
      if (permission === 'NONE') await db.companyAccess.deleteMany({ where: { companyId: id, userId } });
      else await db.companyAccess.upsert({ where: { companyId_userId: { companyId: id, userId } }, create: { companyId: id, userId, permission }, update: { permission } });
      await audit(db, actor.id, 'SHARE', 'company', id, { userId, permission });
      return { ok: true };
    });
  }
  async createContact(actor: Actor, companyId: string, input: z.infer<typeof contactSchema>) {
    return this.prisma.$transaction(async db => {
      await requireCompany(db, actor, companyId, true);
      const contact = await db.contact.create({ data: { ...input, companyId } });
      await audit(db, actor.id, 'CREATE', 'contact', contact.id);
      return contact;
    });
  }
  async updateContact(actor: Actor, companyId: string, id: string, input: z.infer<typeof contactPatchSchema>) {
    return this.prisma.$transaction(async db => {
      await requireCompany(db, actor, companyId, true);
      if (!await db.contact.findFirst({ where: { id, companyId } })) throw new NotFoundException();
      const { archived, ...data } = input;
      const contact = await db.contact.update({ where: { id }, data: { ...data, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) } });
      await audit(db, actor.id, 'UPDATE', 'contact', id, { fields: Object.keys(input) });
      return contact;
    });
  }
  async timeline(actor: Actor, id: string, q: ListQuery) {
    await requireCompany(this.prisma, actor, id);
    const take = Math.min(q.page * q.pageSize, 1000);
    if (q.page * q.pageSize > 1000) throw new BadRequestException('Zaman çizelgesi için daha dar filtre kullanın');
    const date = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) };
    const base = { companyId: id, ...(q.opportunityId ? { opportunityId: q.opportunityId } : {}) };
    const [activities, tasks, meetings, opportunities, quotes, handoffs] = await Promise.all([
      this.prisma.activity.findMany({ where: { ...base, happenedAt: date }, take, orderBy: { happenedAt: 'desc' } }),
      this.prisma.task.findMany({ where: { ...base, createdAt: date }, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.meeting.findMany({ where: { ...base, startsAt: date }, take, orderBy: { startsAt: 'desc' } }),
      this.prisma.opportunity.findMany({ where: { companyId: id, ...(q.opportunityId ? { id: q.opportunityId } : {}), createdAt: date }, take, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, stage: true, createdAt: true } }),
      this.prisma.quote.findMany({ where: { ...base, createdAt: date }, take, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { title: true, status: true } } } }),
      this.prisma.handoff.findMany({ where: { ...base, createdAt: date }, take, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, summary: true } }),
    ]);
    const items = [...activities.map(a => ({ id: a.id, type: 'ACTIVITY', title: a.summary, at: a.happenedAt, detail: a.type })), ...tasks.map(a => ({ id: a.id, type: 'TASK', title: a.title, at: a.createdAt, detail: a.status })), ...meetings.map(a => ({ id: a.id, type: 'MEETING', title: a.title, at: a.startsAt, detail: a.outcome })), ...opportunities.map(a => ({ id: a.id, type: 'OPPORTUNITY', title: a.title, at: a.createdAt, detail: a.stage })), ...quotes.map(a => ({ id: a.id, type: 'QUOTE', title: a.versions[0]?.title ?? 'Teklif', at: a.createdAt, detail: a.versions[0]?.status ?? '' })), ...handoffs.map(a => ({ id: a.id, type: 'HANDOFF', title: a.summary, at: a.createdAt, detail: 'İş devri' }))].sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));
    return { items: items.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), page: q.page };
  }
  directory() { return this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } }); }
}
