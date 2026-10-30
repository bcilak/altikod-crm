import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { milestonePatchSchema, milestoneSchema, projectPatchSchema, projectStatuses, projectTaskSchema, projectTransitions } from '@saleshub/shared';
import { PrismaService } from '../prisma.service';
import { Prisma, ProjectStatus } from '../generated/prisma/client';
import { Actor, isManager } from '../security/access';
import { assignable, audit, companyScope, Db } from '../security/policy';
import { ListQuery, paging } from '../crm/companies.service';
import { scheduleTask } from '../crm/work.service';

/** Managers see all; sales/viewers follow company scope; technicians see projects they own or have a task in, and write only as owner. */
export function projectScope(actor: Pick<Actor, 'id' | 'role'>, write = false): Prisma.ProjectWhereInput {
  if (isManager(actor)) return {};
  if (actor.role === 'TECHNICAL') return { company: { archivedAt: null }, ...(write ? { ownerId: actor.id } : { OR: [{ ownerId: actor.id }, { tasks: { some: { assigneeId: actor.id } } }] }) };
  if (write && actor.role === 'VIEWER') return { id: { in: [] } };
  return { company: { AND: [companyScope(actor, write), ...(write ? [{ archivedAt: null }] : [])] } };
}
const closed: ProjectStatus[] = ['COMPLETED', 'CANCELLED'];
type QuoteSummary = { number: string; version: number; title: string; total: string; currency: string };

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(actor: Actor, q: ListQuery) {
    if (q.status && !projectStatuses.includes(q.status as ProjectStatus)) throw new BadRequestException('Geçersiz proje durumu');
    const where: Prisma.ProjectWhereInput = { AND: [projectScope(actor), { ...(q.status ? { status: q.status as ProjectStatus } : {}), ...(q.ownerId ? { ownerId: q.ownerId } : {}), ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}) }] };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({ where, ...paging(q), orderBy: [{ dueAt: 'asc' }], include: { company: { select: { id: true, displayName: true } }, owner: { select: { id: true, name: true } }, milestones: { select: { completedAt: true } }, tasks: { select: { status: true } } } }),
      this.prisma.project.count({ where }),
    ]);
    return { items: rows.map(({ milestones, tasks, ...p }) => ({ ...p, milestones: { total: milestones.length, done: milestones.filter(m => m.completedAt).length }, openTasks: tasks.filter(t => ['OPEN', 'IN_PROGRESS'].includes(t.status)).length })), total };
  }
  async get(actor: Actor, id: string) {
    const row = await this.prisma.project.findFirst({ where: { AND: [{ id }, projectScope(actor)] }, include: { company: { select: { id: true, displayName: true } }, owner: { select: { id: true, name: true } }, opportunity: { select: { id: true, title: true, wonReason: true } }, handoff: true, milestones: { orderBy: { position: 'asc' } }, tasks: { orderBy: { dueAt: 'asc' }, select: { id: true, title: true, status: true, priority: true, dueAt: true, version: true, assignee: { select: { id: true, name: true } } } } } });
    if (!row) throw new NotFoundException('Proje bulunamadı');
    const { handoff, opportunity, ...project } = row;
    const canWrite = actor.role !== 'VIEWER' && !!await this.prisma.project.findFirst({ where: { AND: [{ id }, projectScope(actor, true)] }, select: { id: true } });
    const snapshot = handoff.snapshot as { quote?: QuoteSummary | null; manualWinReason?: string | null };
    // Technicians get the delivery brief only: no opportunity, quote, amounts or contract.
    const commercial = actor.role === 'TECHNICAL' ? undefined : { opportunity: { id: opportunity.id, title: opportunity.title }, contractUrl: handoff.contractUrl, manualWinReason: snapshot.manualWinReason ?? null, quote: snapshot.quote ? { number: snapshot.quote.number, version: snapshot.quote.version, title: snapshot.quote.title, total: snapshot.quote.total, currency: snapshot.quote.currency } : null };
    // Technicians lack the CRM directory; writers get the candidate list here. assignable() still decides on save.
    const assignees = canWrite ? await this.prisma.user.findMany({ where: { isActive: true, role: { not: 'VIEWER' } }, orderBy: { name: 'asc' }, select: { id: true, name: true, role: true } }) : [];
    return { ...project, summary: handoff.summary, canWrite, canManage: canWrite && actor.role !== 'TECHNICAL', commercial, assignees };
  }
  private async locked(db: Db, actor: Actor, id: string) {
    const visible = await db.project.findFirst({ where: { AND: [{ id }, projectScope(actor)] }, select: { id: true } });
    if (!visible) throw new NotFoundException('Proje bulunamadı');
    await db.$queryRaw`SELECT id FROM "Project" WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await db.project.findFirst({ where: { AND: [{ id }, projectScope(actor, true)] } });
    if (!row) throw new ForbiddenException('Bu projeyi değiştirme yetkiniz yok');
    return row;
  }
  async patch(actor: Actor, id: string, input: z.infer<typeof projectPatchSchema>) {
    return this.prisma.$transaction(async db => {
      const row = await this.locked(db, actor, id);
      const { version: expected, status, ownerId, ...fields } = input;
      if (row.version !== expected) throw new ConflictException('Proje başka biri tarafından değiştirildi; sayfayı yenileyin');
      if (row.status === 'CANCELLED') throw new ConflictException('İptal edilmiş proje değiştirilemez');
      if (ownerId && ownerId !== row.ownerId) {
        if (actor.role === 'TECHNICAL') throw new ForbiddenException('Sorumluyu yalnız satış veya yönetici değiştirebilir');
        await assignable(db, ownerId, row.companyId, true);
      }
      const data: Prisma.ProjectUncheckedUpdateInput = { ...fields, ...(ownerId ? { ownerId } : {}), version: { increment: 1 } };
      if (status && status !== row.status) {
        if (!projectTransitions[row.status].includes(status)) throw new ConflictException('Bu durum geçişine izin verilmiyor');
        if (status === 'COMPLETED') {
          const [openMilestones, openTasks] = await Promise.all([db.projectMilestone.count({ where: { projectId: id, completedAt: null } }), db.task.count({ where: { projectId: id, status: { in: ['OPEN', 'IN_PROGRESS'] } } })]);
          if (openMilestones || openTasks) throw new ConflictException(`Tamamlamak için ${openMilestones} kilometre taşı ve ${openTasks} açık görev kapatılmalı`);
        }
        Object.assign(data, { status, completedAt: status === 'COMPLETED' ? new Date() : null, ...(status === 'IN_PROGRESS' && !row.startAt && !fields.startAt ? { startAt: new Date() } : {}) });
      }
      const result = await db.project.update({ where: { id }, data });
      await audit(db, actor.id, status && status !== row.status ? 'PROJECT_STATUS' : 'UPDATE', 'project', id, { fields: Object.keys(input).filter(k => k !== 'version'), ...(status ? { from: row.status, to: status } : {}) });
      return result;
    });
  }
  async addMilestone(actor: Actor, projectId: string, input: z.infer<typeof milestoneSchema>) {
    return this.prisma.$transaction(async db => {
      const project = await this.locked(db, actor, projectId);
      if (closed.includes(project.status)) throw new ConflictException('Kapalı projeye kilometre taşı eklenemez');
      const last = await db.projectMilestone.aggregate({ where: { projectId }, _max: { position: true } });
      const row = await db.projectMilestone.create({ data: { projectId, title: input.title, dueAt: input.dueAt, position: (last._max.position ?? -1) + 1 } });
      await audit(db, actor.id, 'CREATE', 'project_milestone', row.id, { projectId });
      return row;
    });
  }
  async patchMilestone(actor: Actor, id: string, input: z.infer<typeof milestonePatchSchema>) {
    return this.prisma.$transaction(async db => {
      const milestone = await db.projectMilestone.findUnique({ where: { id } });
      if (!milestone) throw new NotFoundException('Kilometre taşı bulunamadı');
      const project = await this.locked(db, actor, milestone.projectId);
      if (closed.includes(project.status)) throw new ConflictException('Kapalı projenin kilometre taşları değiştirilemez; önce projeyi yeniden açın');
      const { completed, ...fields } = input;
      const row = await db.projectMilestone.update({ where: { id }, data: { ...fields, ...(completed === undefined ? {} : { completedAt: completed ? milestone.completedAt ?? new Date() : null }) } });
      await audit(db, actor.id, 'UPDATE', 'project_milestone', id, { fields: Object.keys(input) });
      return row;
    });
  }
  async addTask(actor: Actor, projectId: string, input: z.infer<typeof projectTaskSchema>) {
    return this.prisma.$transaction(async db => {
      const project = await this.locked(db, actor, projectId);
      if (closed.includes(project.status)) throw new ConflictException('Kapalı projeye görev eklenemez');
      await assignable(db, input.assigneeId, project.companyId, true);
      const task = await db.task.create({ data: { ...input, companyId: project.companyId, opportunityId: project.opportunityId, projectId, createdBy: actor.id } });
      await scheduleTask(db, task, true);
      await audit(db, actor.id, 'CREATE', 'task', task.id, { projectId });
      return task;
    });
  }
}
