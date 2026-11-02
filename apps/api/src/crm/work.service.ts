import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { activitySchema, activityPatchSchema, meetingSchema, meetingPatchSchema, taskSchema, taskPatchSchema } from '@saleshub/shared';
import { PrismaService } from '../prisma.service';
import { Prisma, TaskStatus } from '../generated/prisma/client';
import { Actor } from '../security/access';
import { assignable, audit, companyScope, Db, requireCompany, validateLinks } from '../security/policy';
import { ListQuery, paging } from './companies.service';

export function taskScope(actor: Pick<Actor, 'id' | 'role'>): Prisma.TaskWhereInput {
  return actor.role === 'TECHNICAL' ? { assigneeId: actor.id, company: { archivedAt: null } } : { company: { AND: [companyScope(actor), { archivedAt: null }] } };
}
const taskInclude = { company: { select: { id: true, displayName: true } }, assignee: { select: { id: true, name: true } } } as const;
export async function scheduleTask(db: Db, task: { id: string; version: number; status: TaskStatus; dueAt: Date; reminderAt: Date | null }, assignment: boolean) {
  if (['DONE', 'CANCELLED'].includes(task.status)) return;
  const events = [
    ...(assignment ? [{ type: 'TASK_ASSIGNED', at: new Date() }] : []),
    ...(task.reminderAt ? [{ type: 'TASK_REMINDER', at: task.reminderAt }] : []),
    { type: 'TASK_OVERDUE', at: task.dueAt },
  ];
  for (const event of events) await db.outboxEvent.create({ data: { type: event.type, runAt: event.at, taskId: task.id, taskVersion: task.version, dedupeKey: `${task.id}:${task.version}:${event.type}` } });
}
export type MessageResolver = (messageIds: string[]) => Promise<Map<string, unknown>>;

@Injectable()
export class WorkService {
  constructor(private readonly prisma: PrismaService) {}
  async activities(actor: Actor, q: ListQuery) {
    const where = { company: { AND: [companyScope(actor), { archivedAt: null }] }, ...(q.companyId ? { companyId: q.companyId } : {}), ...(q.opportunityId ? { opportunityId: q.opportunityId } : {}), ...(q.search ? { summary: { contains: q.search, mode: 'insensitive' as const } } : {}) };
    const [items, total] = await this.prisma.$transaction([this.prisma.activity.findMany({ where, ...paging(q), orderBy: { happenedAt: 'desc' }, include: { company: { select: { id: true, displayName: true } } } }), this.prisma.activity.count({ where })]);
    return { items, total };
  }
  async activity(actor: Actor, id: string) {
    const row = await this.prisma.activity.findFirst({ where: { id, company: companyScope(actor) } });
    if (!row) throw new NotFoundException();
    return row;
  }
  async createActivity(actor: Actor, input: z.infer<typeof activitySchema>) {
    return this.prisma.$transaction(async db => {
      await requireCompany(db, actor, input.companyId, true);
      await validateLinks(db, input.companyId, input.opportunityId, input.contactId);
      const row = await db.activity.create({ data: { ...input, source: 'MANUAL', createdBy: actor.id } });
      await audit(db, actor.id, 'CREATE', 'activity', row.id);
      return row;
    });
  }
  async patchActivity(actor: Actor, id: string, input: z.infer<typeof activityPatchSchema>) {
    return this.prisma.$transaction(async db => {
      const row = await db.activity.findFirst({ where: { id, company: companyScope(actor, true) } });
      if (!row) throw new NotFoundException();
      await requireCompany(db, actor, row.companyId, true);
      await validateLinks(db, row.companyId, input.opportunityId, input.contactId);
      const result = await db.activity.update({ where: { id }, data: input });
      await audit(db, actor.id, 'UPDATE', 'activity', id, { fields: Object.keys(input) });
      return result;
    });
  }
  async tasks(actor: Actor, q: ListQuery) {
    if (q.status && !Object.values(TaskStatus).includes(q.status as TaskStatus)) throw new BadRequestException('Geçersiz görev durumu');
    const where: Prisma.TaskWhereInput = { AND: [taskScope(actor), { ...(q.companyId ? { companyId: q.companyId } : {}), ...(q.opportunityId ? { opportunityId: q.opportunityId } : {}), ...(q.assigneeId ? { assigneeId: q.assigneeId } : {}), ...(q.status ? { status: q.status as TaskStatus } : {}), ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}), ...(q.overdue === 'true' ? { dueAt: { lt: new Date() }, status: { in: ['OPEN', 'IN_PROGRESS'] } } : {}) }] };
    const datedWhere = { AND: [where, { dueAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }] };
    const [items, total] = await this.prisma.$transaction([this.prisma.task.findMany({ where: datedWhere, ...paging(q), orderBy: { dueAt: 'asc' }, include: taskInclude }), this.prisma.task.count({ where: datedWhere })]);
    return { items: items.map(row => actor.role === 'TECHNICAL' ? { ...row, opportunityId: undefined } : row), total };
  }
  async task(actor: Actor, id: string) {
    const row = await this.prisma.task.findFirst({ where: { AND: [{ id }, taskScope(actor)] }, include: taskInclude });
    if (!row) throw new NotFoundException();
    return actor.role === 'TECHNICAL' ? { ...row, opportunityId: undefined } : row;
  }
  async createTask(actor: Actor, input: z.infer<typeof taskSchema>) {
    return this.prisma.$transaction(async db => {
      await requireCompany(db, actor, input.companyId, true);
      await validateLinks(db, input.companyId, input.opportunityId);
      await assignable(db, input.assigneeId, input.companyId, true);
      if (input.reminderAt && new Date(input.reminderAt) > new Date(input.dueAt)) throw new BadRequestException('Hatırlatma hedef tarihten sonra olamaz');
      const row = await db.task.create({ data: { ...input, createdBy: actor.id } });
      await scheduleTask(db, row, true);
      await audit(db, actor.id, 'CREATE', 'task', row.id);
      return row;
    });
  }
  async patchTask(actor: Actor, id: string, input: z.infer<typeof taskPatchSchema>) {
    return this.prisma.$transaction(async db => {
      const row = await db.task.findFirst({ where: { AND: [{ id }, taskScope(actor)] } });
      if (!row) throw new NotFoundException();
      if (actor.role === 'TECHNICAL') {
        if (Object.keys(input).some(k => !['status', 'version'].includes(k))) throw new ForbiddenException('Teknik kullanıcı yalnız görev durumunu değiştirebilir');
      } else await requireCompany(db, actor, row.companyId, true);
      if (input.assigneeId) await assignable(db, input.assigneeId, row.companyId, true);
      await validateLinks(db, row.companyId, input.opportunityId);
      const due = input.dueAt ? new Date(input.dueAt) : row.dueAt;
      const reminder = input.reminderAt === undefined ? row.reminderAt : input.reminderAt ? new Date(input.reminderAt) : null;
      if (reminder && reminder > due) throw new BadRequestException('Hatırlatma hedef tarihten sonra olamaz');
      const { version, ...data } = input;
      const updated = await db.task.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 }, ...(input.status ? { completedAt: input.status === 'DONE' ? new Date() : null } : {}) } });
      if (updated.count !== 1) throw new ConflictException('Görev değişti; yenileyin');
      const result = await db.task.findUniqueOrThrow({ where: { id } });
      await scheduleTask(db, result, !!input.assigneeId && input.assigneeId !== row.assigneeId);
      await audit(db, actor.id, 'UPDATE', 'task', id, { fields: Object.keys(data), status: result.status });
      return actor.role === 'TECHNICAL' ? { ...result, opportunityId: undefined } : result;
    });
  }
  async meetings(actor: Actor, q: ListQuery) {
    const where: Prisma.MeetingWhereInput = { company: { AND: [companyScope(actor), { archivedAt: null }] }, ...(q.companyId ? { companyId: q.companyId } : {}), ...(q.opportunityId ? { opportunityId: q.opportunityId } : {}), ...(q.from || q.to ? { startsAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}) };
    const [items, total] = await this.prisma.$transaction([this.prisma.meeting.findMany({ where, ...paging(q), orderBy: { startsAt: 'asc' }, include: { attendees: true, company: { select: { id: true, displayName: true } } } }), this.prisma.meeting.count({ where })]);
    return { items, total };
  }
  async createMeeting(actor: Actor, input: z.infer<typeof meetingSchema>) {
    return this.prisma.$transaction(async db => {
      await requireCompany(db, actor, input.companyId, true);
      await validateLinks(db, input.companyId, input.opportunityId);
      if (new Date(input.endsAt) <= new Date(input.startsAt)) throw new BadRequestException('Bitiş başlangıçtan sonra olmalı');
      await this.attendees(db, input.companyId, input.attendees);
      const { attendees, ...data } = input;
      const now = new Date();
      const attribution = input.notes || input.outcome ? { notesCreatedBy: actor.id, notesCreatedByName: actor.name, notesCreatedAt: now, notesUpdatedBy: actor.id, notesUpdatedByName: actor.name, notesUpdatedAt: now } : {};
      const row = await db.meeting.create({ data: { ...data, ...attribution, createdBy: actor.id, attendees: { create: attendees } }, include: { attendees: true } });
      await audit(db, actor.id, 'CREATE', 'meeting', row.id);
      return row;
    });
  }
  private async attendees(db: Db, companyId: string, attendees: z.infer<typeof meetingSchema>['attendees']) {
    const keys = attendees.map(a => a.userId ?? a.contactId ?? a.externalEmail);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('Katılımcı tekrarlanamaz');
    for (const a of attendees) {
      await validateLinks(db, companyId, null, a.contactId);
      if (a.userId && !await db.user.findFirst({ where: { id: a.userId, isActive: true } })) throw new BadRequestException('Katılımcı bulunamadı');
    }
  }
  async patchMeeting(actor: Actor, id: string, input: z.infer<typeof meetingPatchSchema>) {
    return this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT id FROM "Meeting" WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await db.meeting.findFirst({ where: { id, company: companyScope(actor, true) } });
      if (!row) throw new NotFoundException();
      await requireCompany(db, actor, row.companyId, true);
      await validateLinks(db, row.companyId, input.opportunityId);
      if (new Date(input.endsAt ?? row.endsAt) <= new Date(input.startsAt ?? row.startsAt)) throw new BadRequestException('Bitiş başlangıçtan sonra olmalı');
      const { attendees, ...data } = input;
      if (attendees) {
        await this.attendees(db, row.companyId, attendees);
        await db.meetingAttendee.deleteMany({ where: { meetingId: id } });
      }
      const changed = (input.notes !== undefined && (input.notes || null) !== (row.notes || null)) || (input.outcome !== undefined && (input.outcome || null) !== (row.outcome || null));
      const now = new Date();
      const attribution = changed ? {
        notesUpdatedBy: actor.id, notesUpdatedByName: actor.name, notesUpdatedAt: now,
        ...(!row.notesCreatedAt && !row.notesUpdatedAt && !row.notes && !row.outcome ? { notesCreatedBy: actor.id, notesCreatedByName: actor.name, notesCreatedAt: now } : {}),
      } : {};
      const result = await db.meeting.update({ where: { id }, data: { ...data, ...attribution, ...(attendees ? { attendees: { create: attendees } } : {}) }, include: { attendees: true } });
      await audit(db, actor.id, 'UPDATE', 'meeting', id, { fields: Object.keys(input) });
      return result;
    });
  }
  async meeting(actor: Actor, id: string) {
    const row = await this.prisma.meeting.findFirst({ where: { id, company: companyScope(actor) }, include: { attendees: true, company: { select: { id: true, displayName: true, archivedAt: true } } } });
    if (!row) throw new NotFoundException();
    const writable = actor.role !== 'VIEWER' && !row.company.archivedAt && !!await this.prisma.company.findFirst({ where: { AND: [{ id: row.companyId }, companyScope(actor, true)] }, select: { id: true } });
    return { ...row, canWrite: writable };
  }
  /**
   * Message notifications are resolved by the messaging module (passed in to keep module imports acyclic). Every kind is filtered
   * by the reader's current access, so a notification about something they can no longer see simply disappears.
   */
  async notifications(actor: Actor, messages: MessageResolver) {
    const notifications = await this.prisma.notification.findMany({ where: { userId: actor.id }, orderBy: { createdAt: 'desc' }, take: 100 });
    const tasks = await this.prisma.task.findMany({ where: { AND: [{ id: { in: notifications.flatMap(n => n.taskId ? [n.taskId] : []) } }, taskScope(actor)] }, select: { id: true, title: true, dueAt: true } });
    const quotes = await this.prisma.quoteVersion.findMany({ where: { id: { in: notifications.flatMap(n => n.quoteVersionId ? [n.quoteVersionId] : []) }, quote: { company: companyScope(actor) } }, select: { id: true, quoteId: true, title: true } });
    const message = await messages(notifications.flatMap(n => n.messageId ? [n.messageId] : []));
    return notifications.filter(n => tasks.some(t => t.id === n.taskId) || quotes.some(q => q.id === n.quoteVersionId) || (n.messageId && message.has(n.messageId)))
      .map(n => ({ ...n, task: tasks.find(t => t.id === n.taskId), quote: quotes.find(q => q.id === n.quoteVersionId), message: n.messageId ? message.get(n.messageId) : undefined }));
  }
  async readNotification(actor: Actor, id: string, messages: MessageResolver) {
    const notification = await this.prisma.notification.findFirst({ where: { id, userId: actor.id } });
    if (!notification) throw new NotFoundException();
    if (notification.taskId) await this.task(actor, notification.taskId);
    else if (notification.messageId) { if (!(await messages([notification.messageId])).size) throw new NotFoundException(); }
    else if (!await this.prisma.quoteVersion.findFirst({ where: { id: notification.quoteVersionId!, quote: { company: companyScope(actor) } } })) throw new NotFoundException();
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }
}
