import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { knowledgeContentSchema, messageEditWindowMs, messagePinsPerConversation, attachmentMaxBytes } from '@saleshub/shared';
import { PrismaService } from '../prisma.service';
import { Prisma } from '../generated/prisma/client';
import { Actor } from '../security/access';
import { audit, can, Db } from '../security/policy';
import { activeMessage, canModerate, canPost, conversationScope, messageSelect, messageState, MessagingService, shape } from './messaging.service';

const conversationFields = { id: true, kind: true, archivedAt: true, postingRestricted: true, companyId: true, opportunityId: true, projectId: true, lastSeq: true } as const;
const knowledgeTypes = ['application/pdf', 'image/png', 'image/jpeg'];

/** Everything that changes a message after it was sent: edit, delete, moderation, pins, plus mute, search and knowledge suggestions. */
@Injectable()
export class MessageLifecycleService {
  constructor(private readonly prisma: PrismaService, private readonly messaging: MessagingService) {}

  /** The message, locked, if the actor can see its conversation. */
  private async locked(db: Db, actor: Actor, id: string) {
    const row = await db.message.findFirst({ where: { id, conversation: conversationScope(actor) }, select: { id: true, conversationId: true, authorId: true, createdAt: true, body: true, deletedAt: true, hiddenAt: true, expiredAt: true, pinnedAt: true, conversation: { select: conversationFields }, _count: { select: { attachments: { where: { removedAt: null } } } } } });
    if (!row) throw new NotFoundException('Mesaj bulunamadı');
    await db.$queryRaw`SELECT id FROM "Message" WHERE id = ${id}::uuid FOR UPDATE`;
    return { ...row, state: messageState(row) };
  }
  private result(db: Db, id: string, viewerId: string) { return db.message.findUniqueOrThrow({ where: { id }, select: { ...messageSelect, _count: { select: { replies: true } } } }).then(({ _count, ...m }) => ({ ...shape(m, viewerId), replyCount: _count.replies })); }

  /** Authors may correct their own message for 15 minutes; the database archives the previous text and enforces the window too. */
  async edit(actor: Actor, id: string, body: string) {
    return this.prisma.$transaction(async db => {
      const m = await this.locked(db, actor, id);
      if (m.authorId !== actor.id) throw new ForbiddenException('Yalnız kendi mesajınızı düzenleyebilirsiniz');
      if (m.state !== 'ACTIVE') throw new ConflictException('Bu mesaj düzenlenemez');
      if (Date.now() - m.createdAt.getTime() > messageEditWindowMs) throw new ConflictException('Mesajlar yalnız gönderildikten sonraki 15 dakika içinde düzenlenebilir');
      if (m.conversation.archivedAt) throw new ConflictException('Arşivlenmiş konuşmadaki mesaj düzenlenemez');
      if (!await canPost(db, actor, m.conversation)) throw new ForbiddenException('Bu konuşmaya yazma yetkiniz yok');
      if (!body && !m._count.attachments) throw new BadRequestException('Mesaj metni boş olamaz');
      if (body !== m.body) {
        await db.message.update({ where: { id }, data: { body, editedAt: new Date() } });
        await audit(db, actor.id, 'MESSAGE_EDIT', 'message', id, { conversationId: m.conversationId });
      }
      return this.result(db, id, actor.id);
    });
  }
  /** Soft deletion by the author: the place stays (“Bu mesaj silindi”), the content is kept for audit/retention but never served again. */
  async remove(actor: Actor, id: string) {
    return this.prisma.$transaction(async db => {
      const m = await this.locked(db, actor, id);
      if (m.authorId !== actor.id) throw new ForbiddenException('Yalnız kendi mesajınızı silebilirsiniz');
      if (m.state === 'DELETED' || m.state === 'EXPIRED') throw new ConflictException('Bu mesaj zaten kaldırıldı');
      await db.message.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actor.id, pinnedAt: null, pinnedById: null } });
      await audit(db, actor.id, 'MESSAGE_DELETE', 'message', id, { conversationId: m.conversationId });
      return this.result(db, id, actor.id);
    });
  }
  async hide(actor: Actor, id: string, reason: string | null) {
    return this.prisma.$transaction(async db => {
      const m = await this.locked(db, actor, id);
      if (!await canModerate(db, actor, m.conversation)) throw new ForbiddenException('Bu konuşmada moderasyon yetkiniz yok');
      if (reason !== null && m.state !== 'ACTIVE') throw new ConflictException('Yalnız görünür mesaj gizlenebilir');
      if (reason === null && m.state !== 'HIDDEN') throw new ConflictException('Mesaj gizli değil');
      await db.message.update({ where: { id }, data: reason === null ? { hiddenAt: null, hiddenById: null, hiddenReason: null } : { hiddenAt: new Date(), hiddenById: actor.id, hiddenReason: reason, pinnedAt: null, pinnedById: null } });
      await audit(db, actor.id, reason === null ? 'MESSAGE_UNHIDE' : 'MESSAGE_HIDE', 'message', id, { conversationId: m.conversationId, ...(reason ? { reason } : {}) });
      return this.result(db, id, actor.id);
    });
  }
  async pin(actor: Actor, id: string, pinned: boolean) {
    return this.prisma.$transaction(async db => {
      const m = await this.locked(db, actor, id);
      if (m.state !== 'ACTIVE') throw new ConflictException('Bu mesaj sabitlenemez');
      if (!await canPost(db, actor, m.conversation)) throw new ForbiddenException('Bu konuşmaya yazma yetkiniz yok');
      if (pinned && !m.pinnedAt) {
        await db.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${m.conversationId}::uuid FOR UPDATE`;
        if (await db.message.count({ where: { conversationId: m.conversationId, pinnedAt: { not: null } } }) >= messagePinsPerConversation) throw new ConflictException(`Bir konuşmada en fazla ${messagePinsPerConversation} mesaj sabitlenebilir`);
      }
      if (pinned !== !!m.pinnedAt) {
        await db.message.update({ where: { id }, data: pinned ? { pinnedAt: new Date(), pinnedById: actor.id } : { pinnedAt: null, pinnedById: null } });
        await audit(db, actor.id, pinned ? 'MESSAGE_PIN' : 'MESSAGE_UNPIN', 'message', id, { conversationId: m.conversationId });
      }
      return this.result(db, id, actor.id);
    });
  }
  /** Toggles one reaction of the actor. Same rule as pinning: anyone who can write to the conversation; visible messages only. */
  async react(actor: Actor, id: string, emoji: string) {
    return this.prisma.$transaction(async db => {
      const m = await this.locked(db, actor, id);
      if (m.state !== 'ACTIVE') throw new ConflictException('Bu mesaja tepki verilemez');
      if (!await canPost(db, actor, m.conversation)) throw new ForbiddenException('Bu konuşmaya yazma yetkiniz yok');
      const key = { messageId_userId_emoji: { messageId: id, userId: actor.id, emoji } };
      if (await db.messageReaction.findUnique({ where: key })) await db.messageReaction.delete({ where: key });
      else await db.messageReaction.create({ data: { messageId: id, userId: actor.id, emoji } });
      return this.result(db, id, actor.id);
    });
  }
  async pins(actor: Actor, conversationId: string) {
    if (!await this.prisma.conversation.findFirst({ where: { AND: [{ id: conversationId }, conversationScope(actor)] }, select: { id: true } })) throw new NotFoundException('Konuşma bulunamadı');
    const rows = await this.prisma.message.findMany({ where: { conversationId, pinnedAt: { not: null }, ...activeMessage }, orderBy: { pinnedAt: 'desc' }, select: messageSelect });
    return rows.map(m => ({ ...shape(m, actor.id), replyCount: 0 }));
  }
  /** Earlier texts of an edited message, oldest first, followed by the current one. Not available once removed or hidden. */
  async revisions(actor: Actor, id: string) {
    const m = await this.prisma.message.findFirst({ where: { id, ...activeMessage, conversation: conversationScope(actor) }, select: { body: true, createdAt: true, editedAt: true, revisions: { orderBy: { createdAt: 'asc' }, select: { body: true, createdAt: true } } } });
    if (!m) throw new NotFoundException('Mesaj bulunamadı');
    return [...m.revisions.map(r => ({ body: r.body, at: r.createdAt, current: false })), { body: m.body, at: m.editedAt ?? m.createdAt, current: true }];
  }
  async mute(actor: Actor, conversationId: string, until: string | null) {
    const c = await this.prisma.conversation.findFirst({ where: { AND: [{ id: conversationId }, conversationScope(actor)] }, select: { id: true, lastSeq: true } });
    if (!c) throw new NotFoundException('Konuşma bulunamadı');
    const mutedUntil = until && new Date(until) > new Date() ? new Date(until) : null;
    await this.prisma.conversationReadState.upsert({ where: { conversationId_userId: { conversationId, userId: actor.id } }, create: { conversationId, userId: actor.id, lastReadSeq: c.lastSeq, mutedUntil }, update: { mutedUntil } });
    return { mutedUntil };
  }
  /**
   * Turkish full-text search (stemmed, prefix-matching words) plus file-name matches. The candidate set is first narrowed to
   * conversations the actor can read, so ranking and limits never reveal anything outside their access.
   */
  async search(actor: Actor, q: string, conversationId?: string) {
    const words = (q.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
    if (!words.length) throw new BadRequestException('Aramak için en az bir kelime yazın');
    const visible = (await this.prisma.conversation.findMany({ where: { AND: [conversationScope(actor), conversationId ? { id: conversationId } : {}] }, select: { id: true } })).map(c => c.id);
    if (!visible.length) return { items: [] };
    const query = words.map(w => `${w}:*`).join(' & ');
    const pattern = `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`;
    const hits = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT m.id FROM "Message" m
      WHERE m."conversationId" = ANY(${visible}::uuid[]) AND m."deletedAt" IS NULL AND m."hiddenAt" IS NULL AND m."expiredAt" IS NULL
        AND (to_tsvector('turkish', m.body) @@ to_tsquery('turkish', ${query})
          OR EXISTS (SELECT 1 FROM "MessageAttachment" a WHERE a."messageId" = m.id AND a."removedAt" IS NULL AND a.name ILIKE ${pattern}))
      ORDER BY ts_rank(to_tsvector('turkish', m.body), to_tsquery('turkish', ${query})) DESC, m."createdAt" DESC
      LIMIT 50`);
    const rows = await this.prisma.message.findMany({ where: { id: { in: hits.map(h => h.id) } }, select: messageSelect });
    const names = await this.messaging.describe(actor, [...new Set(rows.map(r => r.conversationId))]);
    const order = new Map(hits.map((h, i) => [h.id, i]));
    return { items: rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!).map(m => ({ message: { ...shape(m, actor.id), replyCount: 0 }, conversation: names.get(m.conversationId)! })) };
  }
  /**
   * Turns a message into a draft knowledge card for review (Faz 6 workflow). Clean PDF/PNG/JPEG files up to 5 MB are attached
   * by reference (content-addressed storage); other files are reported as skipped. Requires knowledge.write.
   */
  async toKnowledge(actor: Actor, id: string, input: { title: string; category: string }) {
    return this.prisma.$transaction(async db => {
      if (!await can(db, actor, 'knowledge', 'write')) throw new ForbiddenException('Bilgi kartı oluşturma yetkiniz yok');
      const m = await db.message.findFirst({ where: { id, ...activeMessage, conversation: conversationScope(actor) }, select: { id: true, body: true, conversationId: true, attachments: { where: { removedAt: null }, select: { id: true, name: true, mimeType: true, size: true, fileKey: true, checksum: true, scanStatus: true } } } });
      if (!m) throw new NotFoundException('Mesaj bulunamadı');
      const summary = m.body ? (m.body.length > 2000 ? `${m.body.slice(0, 1999)}…` : m.body) : 'Mesajlaşmada paylaşılan dosyalardan önerildi.';
      const article = await db.knowledgeArticle.create({ data: { title: input.title, category: input.category, ownerId: actor.id, versions: { create: { ...knowledgeContentSchema.parse({ summary }), version: 1, authorId: actor.id } } } });
      const usable = m.attachments.filter(a => a.scanStatus === 'CLEAN' && knowledgeTypes.includes(a.mimeType) && a.size <= attachmentMaxBytes);
      for (const a of usable) await db.knowledgeAttachment.create({ data: { articleId: article.id, name: a.name, mimeType: a.mimeType, size: a.size, fileKey: a.fileKey, checksum: a.checksum, uploadedBy: actor.id } });
      await audit(db, actor.id, 'KNOWLEDGE_FROM_MESSAGE', 'knowledge_article', article.id, { messageId: id, conversationId: m.conversationId, files: usable.length });
      return { articleId: article.id, attached: usable.map(a => a.name), skipped: m.attachments.filter(a => !usable.includes(a)).map(a => a.name) };
    });
  }
}
