import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { conversationCreateSchema, conversationListSchema, conversationPatchSchema, conversationRecordTypes, groupMaxMembers, messageCreateSchema, messageListSchema } from '@saleshub/shared';
import { PrismaService } from '../prisma.service';
import { ConversationKind, Prisma } from '../generated/prisma/client';
import { Actor, isManager } from '../security/access';
import { audit, can, companyScope, Db } from '../security/policy';
import { projectScope } from '../delivery/projects.service';

type RecordType = typeof conversationRecordTypes[number];
const userCard = { select: { id: true, name: true, isActive: true } } as const;
const listInclude = (actorId: string) => ({
  members: { where: { leftAt: null }, select: { userId: true, role: true, user: userCard } },
  reads: { where: { userId: actorId }, select: { lastReadSeq: true } },
  company: { select: { id: true, displayName: true } }, opportunity: { select: { id: true, title: true } }, project: { select: { id: true, title: true } },
}) satisfies Prisma.ConversationInclude;
type Row = Prisma.ConversationGetPayload<{ include: ReturnType<typeof listInclude> }>;

/**
 * Who can see a conversation. Public channels: every user; channels, groups and direct messages: active members only (ADMIN included);
 * record conversations: exactly the record's own scope, evaluated at query time so revoked shares take effect immediately.
 */
export function conversationScope(actor: Pick<Actor, 'id' | 'role'>): Prisma.ConversationWhereInput {
  return { OR: [
    { kind: 'CHANNEL', isPublic: true },
    { kind: { in: ['CHANNEL', 'GROUP', 'DIRECT'] }, members: { some: { userId: actor.id, leftAt: null } } },
    { kind: 'RECORD', companyId: { not: null }, company: { is: companyScope(actor) } },
    { kind: 'RECORD', opportunityId: { not: null }, opportunity: { is: { company: companyScope(actor) } } },
    { kind: 'RECORD', projectId: { not: null }, project: { is: projectScope(actor) } },
  ] };
}

/** Writing follows the record's write scope; technicians may write wherever they can see a project. VIEWER never writes outside direct messages. */
async function canPost(db: Db, actor: Actor, c: Pick<Row, 'id' | 'kind' | 'archivedAt' | 'postingRestricted' | 'companyId' | 'opportunityId' | 'projectId'>) {
  if (c.archivedAt) return false;
  if (c.kind !== 'RECORD') {
    if (actor.role === 'VIEWER' && c.kind !== 'DIRECT') return false;
    if (c.postingRestricted && !isManager(actor)) return false;
    return !!await db.conversationMember.findFirst({ where: { conversationId: c.id, userId: actor.id, leftAt: null } });
  }
  if (actor.role === 'VIEWER') return false;
  const writable = { AND: [companyScope(actor, true), { archivedAt: null }] };
  if (c.companyId) return !!await db.company.findFirst({ where: { AND: [{ id: c.companyId }, writable] }, select: { id: true } });
  if (c.opportunityId) return !!await db.opportunity.findFirst({ where: { id: c.opportunityId, company: writable }, select: { id: true } });
  return !!await db.project.findFirst({ where: { AND: [{ id: c.projectId! }, projectScope(actor, actor.role !== 'TECHNICAL')] }, select: { id: true } });
}
const channelName = (name: string) => {
  const value = name.replace(/^#/, '').toLocaleLowerCase('tr-TR');
  if (!/^[\p{L}\p{N}_-]{1,80}$/u.test(value)) throw new BadRequestException('Kanal adı yalnız harf, rakam, - ve _ içerebilir');
  return value;
};
const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService) {}

  private dto(actor: Actor, c: Row) {
    const me = c.members.find(m => m.userId === actor.id);
    const followed = c.kind === 'RECORD' ? c.reads.length > 0 : !!me;
    const other = c.kind === 'DIRECT' ? c.members.find(m => m.userId !== actor.id)?.user : undefined;
    const record = c.company ? { type: 'COMPANY' as const, id: c.company.id, title: c.company.displayName } : c.opportunity ? { type: 'OPPORTUNITY' as const, id: c.opportunity.id, title: c.opportunity.title } : c.project ? { type: 'PROJECT' as const, id: c.project.id, title: c.project.title } : null;
    return {
      id: c.id, kind: c.kind, name: other?.name ?? record?.title ?? c.name, topic: c.topic, isPublic: c.isPublic, postingRestricted: c.postingRestricted,
      archivedAt: c.archivedAt, lastSeq: c.lastSeq, lastMessageAt: c.lastMessageAt, record, directUser: other ?? null,
      joined: followed, myRole: me?.role ?? null, memberCount: c.kind === 'RECORD' ? null : c.members.length,
      unread: followed ? Math.max(0, c.lastSeq - (c.reads[0]?.lastReadSeq ?? 0)) : 0,
    };
  }
  private async visible(db: Db, actor: Actor, id: string) {
    const row = await db.conversation.findFirst({ where: { AND: [{ id }, conversationScope(actor)] }, include: listInclude(actor.id) });
    if (!row) throw new NotFoundException('Konuşma bulunamadı');
    return row;
  }
  private markRead(db: Db, conversationId: string, userId: string, seq: number) {
    return db.$executeRaw`INSERT INTO "ConversationReadState" ("conversationId", "userId", "lastReadSeq", "updatedAt") VALUES (${conversationId}::uuid, ${userId}::uuid, ${seq}, NOW())
      ON CONFLICT ("conversationId", "userId") DO UPDATE SET "lastReadSeq" = GREATEST("ConversationReadState"."lastReadSeq", EXCLUDED."lastReadSeq"), "updatedAt" = NOW()`;
  }
  /** Active users other than the actor; GROUP members additionally may not be VIEWER (read-only role is limited to channels and direct messages). */
  private async validUsers(db: Db, actor: Actor, ids: string[], kind: ConversationKind) {
    const unique = [...new Set(ids)].filter(id => id !== actor.id);
    const users = await db.user.findMany({ where: { id: { in: unique }, isActive: true, ...(kind === 'GROUP' ? { role: { not: 'VIEWER' } } : {}) }, select: { id: true } });
    if (users.length !== unique.length) throw new BadRequestException('Üyelerden biri bulunamadı, pasif veya bu konuşmaya eklenemez');
    return unique;
  }

  async list(actor: Actor, q: z.infer<typeof conversationListSchema>) {
    const rows = await this.prisma.conversation.findMany({
      where: { AND: [conversationScope(actor), q.kind ? { kind: q.kind } : {}, { OR: [{ members: { some: { userId: actor.id, leftAt: null } } }, { kind: 'CHANNEL', isPublic: true }, { kind: 'RECORD', reads: { some: { userId: actor.id } } }] }] },
      include: listInclude(actor.id), orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }], take: 500,
    });
    const items = rows.map(row => this.dto(actor, row));
    return { items, unreadTotal: items.reduce((sum, c) => sum + c.unread, 0) };
  }
  async get(actor: Actor, id: string) {
    const row = await this.visible(this.prisma, actor, id);
    const canManage = row.kind === 'CHANNEL' ? await can(this.prisma, actor, 'messaging', 'channels.manage') : row.kind === 'GROUP' && row.members.some(m => m.userId === actor.id && m.role === 'OWNER');
    return { ...this.dto(actor, row), canPost: await canPost(this.prisma, actor, row), canManage,
      members: row.kind === 'RECORD' ? [] : row.members.map(m => ({ ...m.user, role: m.role })).sort((a, b) => a.name.localeCompare(b.name, 'tr')) };
  }
  async create(actor: Actor, input: z.infer<typeof conversationCreateSchema>) {
    return this.prisma.$transaction(async db => {
      if (input.kind === 'CHANNEL' && !await can(db, actor, 'messaging', 'channels.manage')) throw new ForbiddenException('Kanalı yalnız yönetici açabilir');
      if (input.kind === 'GROUP' && actor.role === 'VIEWER') throw new ForbiddenException('Salt okunur kullanıcı grup açamaz');
      const name = input.kind === 'CHANNEL' ? channelName(input.name) : input.name;
      if (input.kind === 'CHANNEL' && await db.conversation.findFirst({ where: { kind: 'CHANNEL', name: { equals: name, mode: 'insensitive' } }, select: { id: true } })) throw new ConflictException('Bu adda bir kanal zaten var');
      const memberIds = await this.validUsers(db, actor, input.memberIds, input.kind);
      const row = await db.conversation.create({ data: {
        kind: input.kind, name, topic: input.topic, createdById: actor.id,
        ...(input.kind === 'CHANNEL' ? { isPublic: input.isPublic, postingRestricted: input.postingRestricted } : {}),
        members: { create: [{ userId: actor.id, role: 'OWNER' }, ...memberIds.map(userId => ({ userId }))] },
        reads: { create: [actor.id, ...memberIds].map(userId => ({ userId })) },
      } });
      await audit(db, actor.id, 'CREATE', 'conversation', row.id, { kind: row.kind, members: memberIds.length + 1 });
      return this.dto(actor, await this.visible(db, actor, row.id));
    });
  }
  async patch(actor: Actor, id: string, input: z.infer<typeof conversationPatchSchema>) {
    return this.prisma.$transaction(async db => {
      const row = await this.manageable(db, actor, id, true);
      if (row.kind === 'GROUP' && input.postingRestricted !== undefined) throw new BadRequestException('Yazma kısıtı yalnız kanallarda kullanılır');
      if (row.archivedAt && input.archived !== false) throw new ConflictException('Arşivlenmiş konuşma değiştirilemez; önce arşivden çıkarın');
      const name = input.name === undefined ? undefined : row.kind === 'CHANNEL' ? channelName(input.name) : input.name;
      if (row.kind === 'CHANNEL' && name && await db.conversation.findFirst({ where: { kind: 'CHANNEL', id: { not: id }, name: { equals: name, mode: 'insensitive' } }, select: { id: true } })) throw new ConflictException('Bu adda bir kanal zaten var');
      const { archived, ...fields } = input;
      await db.conversation.update({ where: { id }, data: { ...fields, ...(name ? { name } : {}), ...(archived === undefined ? {} : { archivedAt: archived ? row.archivedAt ?? new Date() : null }), version: { increment: 1 } } });
      await audit(db, actor.id, archived === undefined ? 'UPDATE' : archived ? 'ARCHIVE' : 'RESTORE', 'conversation', id, { fields: Object.keys(input) });
      return this.dto(actor, await this.visible(db, actor, id));
    });
  }
  /** Channels are managed by channels.manage holders; groups by their owners. Direct and record conversations have fixed membership. */
  private async manageable(db: Db, actor: Actor, id: string, allowArchived = false) {
    const row = await this.visible(db, actor, id);
    await db.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${id}::uuid FOR UPDATE`;
    if (row.kind === 'DIRECT' || row.kind === 'RECORD') throw new BadRequestException('Bu konuşmanın üyeliği değiştirilemez');
    const allowed = row.kind === 'CHANNEL' ? await can(db, actor, 'messaging', 'channels.manage') : row.members.some(m => m.userId === actor.id && m.role === 'OWNER');
    if (!allowed) throw new ForbiddenException('Bu konuşmayı yönetme yetkiniz yok');
    if (row.archivedAt && !allowArchived) throw new ConflictException('Arşivlenmiş konuşma değiştirilemez');
    return row;
  }
  async addMembers(actor: Actor, id: string, userIds: string[]) {
    return this.prisma.$transaction(async db => {
      const row = await this.manageable(db, actor, id);
      const ids = (await this.validUsers(db, actor, userIds, row.kind)).filter(userId => !row.members.some(m => m.userId === userId));
      if (row.kind === 'GROUP' && row.members.length + ids.length > groupMaxMembers) throw new ConflictException(`Grup en fazla ${groupMaxMembers} kişi olabilir`);
      for (const userId of ids) {
        await db.conversationMember.upsert({ where: { conversationId_userId: { conversationId: id, userId } }, create: { conversationId: id, userId }, update: { leftAt: null, role: 'MEMBER', joinedAt: new Date() } });
        await this.markRead(db, id, userId, row.lastSeq);
      }
      if (ids.length) await audit(db, actor.id, 'MEMBER_ADD', 'conversation', id, { userIds: ids });
      return this.get(actor, id);
    });
  }
  async removeMember(actor: Actor, id: string, userId: string) {
    if (userId === actor.id) return this.leave(actor, id);
    return this.prisma.$transaction(async db => {
      const row = await this.manageable(db, actor, id);
      const member = row.members.find(m => m.userId === userId);
      if (!member) throw new NotFoundException('Üye bulunamadı');
      if (member.role === 'OWNER') throw new ForbiddenException('Grup sahibi çıkarılamaz');
      await db.conversationMember.update({ where: { conversationId_userId: { conversationId: id, userId } }, data: { leftAt: new Date() } });
      await audit(db, actor.id, 'MEMBER_REMOVE', 'conversation', id, { userId });
      return { ok: true };
    });
  }
  async join(actor: Actor, id: string) {
    return this.prisma.$transaction(async db => {
      const row = await this.visible(db, actor, id);
      if (row.kind !== 'CHANNEL' || !row.isPublic) throw new BadRequestException('Yalnız herkese açık kanallara katılabilirsiniz');
      if (row.archivedAt) throw new ConflictException('Arşivlenmiş kanala katılamazsınız');
      await db.conversationMember.upsert({ where: { conversationId_userId: { conversationId: id, userId: actor.id } }, create: { conversationId: id, userId: actor.id }, update: { leftAt: null } });
      await this.markRead(db, id, actor.id, row.lastSeq);
      return this.dto(actor, await this.visible(db, actor, id));
    });
  }
  /** A sole group owner who leaves hands ownership to the longest-standing member, so a group never becomes unmanageable. */
  async leave(actor: Actor, id: string) {
    return this.prisma.$transaction(async db => {
      const row = await this.visible(db, actor, id);
      if (row.kind === 'DIRECT' || row.kind === 'RECORD') throw new BadRequestException('Bu konuşmadan ayrılınamaz');
      await db.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${id}::uuid FOR UPDATE`;
      const me = await db.conversationMember.findFirst({ where: { conversationId: id, userId: actor.id, leftAt: null } });
      if (!me) throw new NotFoundException('Bu konuşmanın üyesi değilsiniz');
      await db.conversationMember.update({ where: { conversationId_userId: { conversationId: id, userId: actor.id } }, data: { leftAt: new Date(), role: 'MEMBER' } });
      if (me.role === 'OWNER' && !await db.conversationMember.count({ where: { conversationId: id, leftAt: null, role: 'OWNER' } })) {
        const next = await db.conversationMember.findFirst({ where: { conversationId: id, leftAt: null, user: { isActive: true } }, orderBy: { joinedAt: 'asc' } });
        if (next) await db.conversationMember.update({ where: { conversationId_userId: { conversationId: id, userId: next.userId } }, data: { role: 'OWNER' } });
      }
      await audit(db, actor.id, 'MEMBER_LEAVE', 'conversation', id);
      return { ok: true };
    });
  }
  async direct(actor: Actor, userId: string) {
    if (userId === actor.id) throw new BadRequestException('Kendinize mesaj başlatamazsınız');
    if (!await this.prisma.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true } })) throw new NotFoundException('Kullanıcı bulunamadı');
    const directKey = [actor.id, userId].sort().join(':');
    const existing = await this.prisma.conversation.findUnique({ where: { directKey }, select: { id: true } });
    if (!existing) {
      try {
        await this.prisma.conversation.create({ data: { kind: 'DIRECT', directKey, createdById: actor.id, members: { create: [{ userId: actor.id }, { userId }] }, reads: { create: [{ userId: actor.id }, { userId }] } } });
      } catch (error) { if (!isUniqueViolation(error)) throw error; }
    }
    const row = await this.prisma.conversation.findUniqueOrThrow({ where: { directKey }, select: { id: true } });
    return this.dto(actor, await this.visible(this.prisma, actor, row.id));
  }
  /** Opens (creating on first use) the conversation of a record the actor can see, and follows it. Never grants access to the record. */
  async record(actor: Actor, recordType: RecordType, recordId: string) {
    const field = ({ COMPANY: 'companyId', OPPORTUNITY: 'opportunityId', PROJECT: 'projectId' } as const)[recordType];
    const visible = recordType === 'COMPANY' ? await this.prisma.company.findFirst({ where: { AND: [{ id: recordId }, companyScope(actor)] }, select: { id: true } })
      : recordType === 'OPPORTUNITY' ? await this.prisma.opportunity.findFirst({ where: { id: recordId, company: companyScope(actor) }, select: { id: true } })
        : await this.prisma.project.findFirst({ where: { AND: [{ id: recordId }, projectScope(actor)] }, select: { id: true } });
    if (!visible) throw new NotFoundException('Kayıt bulunamadı');
    let row = await this.prisma.conversation.findFirst({ where: { [field]: recordId }, select: { id: true, lastSeq: true } });
    if (!row) {
      try { row = await this.prisma.conversation.create({ data: { kind: 'RECORD', [field]: recordId, createdById: actor.id }, select: { id: true, lastSeq: true } }); }
      catch (error) { if (!isUniqueViolation(error)) throw error; row = await this.prisma.conversation.findFirstOrThrow({ where: { [field]: recordId }, select: { id: true, lastSeq: true } }); }
    }
    await this.prisma.conversationReadState.upsert({ where: { conversationId_userId: { conversationId: row.id, userId: actor.id } }, create: { conversationId: row.id, userId: actor.id, lastReadSeq: row.lastSeq }, update: {} });
    return this.get(actor, row.id);
  }

  async messages(actor: Actor, id: string, q: z.infer<typeof messageListSchema>) {
    const row = await this.visible(this.prisma, actor, id);
    if (q.parentId && !await this.prisma.message.findFirst({ where: { id: q.parentId, conversationId: id, parentId: null }, select: { id: true } })) throw new NotFoundException('Mesaj bulunamadı');
    const ascending = q.afterSeq !== undefined;
    const rows = await this.prisma.message.findMany({
      where: { conversationId: id, parentId: q.parentId ?? null, ...(q.beforeSeq !== undefined ? { seq: { lt: q.beforeSeq } } : {}), ...(ascending ? { seq: { gt: q.afterSeq } } : {}) },
      orderBy: { seq: ascending ? 'asc' : 'desc' }, take: q.limit + 1,
      select: { id: true, seq: true, parentId: true, body: true, createdAt: true, author: userCard, _count: { select: { replies: true } } },
    });
    const hasMore = rows.length > q.limit; const page = rows.slice(0, q.limit);
    if (!ascending) page.reverse();
    return { items: page.map(({ _count, ...m }) => ({ ...m, replyCount: _count.replies })), hasMore, lastSeq: row.lastSeq, readSeq: row.reads[0]?.lastReadSeq ?? 0 };
  }
  /** Idempotent per (author, clientNonce): a retried request returns the original message instead of posting twice. */
  async send(actor: Actor, id: string, input: z.infer<typeof messageCreateSchema>) {
    const replay = async () => {
      const prior = await this.prisma.message.findUnique({ where: { authorId_clientNonce: { authorId: actor.id, clientNonce: input.clientNonce } }, select: { id: true, seq: true, conversationId: true, parentId: true, body: true, createdAt: true, author: userCard } });
      if (!prior) return undefined;
      await this.visible(this.prisma, actor, id);
      if (prior.conversationId !== id || prior.body !== input.body || prior.parentId !== (input.parentId ?? null)) throw new ConflictException('Bu istek anahtarı başka bir mesaj için kullanıldı');
      return { ...prior, replyCount: 0 };
    };
    const prior = await replay();
    if (prior) return prior;
    try {
      return await this.prisma.$transaction(async db => {
        const row = await this.visible(db, actor, id);
        if (row.archivedAt) throw new ConflictException('Arşivlenmiş konuşmaya yazılamaz');
        if (!await canPost(db, actor, row)) throw new ForbiddenException('Bu konuşmaya yazma yetkiniz yok');
        if (input.parentId && !await db.message.findFirst({ where: { id: input.parentId, conversationId: id, parentId: null }, select: { id: true } })) throw new NotFoundException('Yanıtlanan mesaj bulunamadı');
        // The row update serialises writers per conversation and hands out a gap-free sequence number.
        const { lastSeq: seq } = await db.conversation.update({ where: { id }, data: { lastSeq: { increment: 1 }, lastMessageAt: new Date() }, select: { lastSeq: true } });
        const message = await db.message.create({ data: { conversationId: id, seq, authorId: actor.id, parentId: input.parentId, body: input.body, clientNonce: input.clientNonce }, select: { id: true, seq: true, conversationId: true, parentId: true, body: true, createdAt: true, author: userCard } });
        await this.markRead(db, id, actor.id, seq);
        return { ...message, replyCount: 0 };
      });
    } catch (error) {
      const raced = isUniqueViolation(error) ? await replay() : undefined;
      if (raced) return raced;
      throw error;
    }
  }
  async read(actor: Actor, id: string, seq: number) {
    const row = await this.visible(this.prisma, actor, id);
    await this.markRead(this.prisma, id, actor.id, Math.min(seq, row.lastSeq));
    return { lastReadSeq: Math.max(row.reads[0]?.lastReadSeq ?? 0, Math.min(seq, row.lastSeq)) };
  }
  /** Minimal people directory for starting conversations: name and role only, no contact details. */
  users(actor: Actor, search?: string) {
    return this.prisma.user.findMany({ where: { isActive: true, id: { not: actor.id }, ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}) }, orderBy: { name: 'asc' }, take: 50, select: { id: true, name: true, role: true } });
  }
}
