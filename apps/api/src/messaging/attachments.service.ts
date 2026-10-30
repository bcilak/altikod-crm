import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, PayloadTooLargeException } from '@nestjs/common';
import { attachmentNameSchema, messageAttachmentMaxBytes } from '@saleshub/shared';
import { PrismaService } from '../prisma.service';
import { AttachmentScanStatus, Prisma } from '../generated/prisma/client';
import { Actor } from '../security/access';
import { audit } from '../security/policy';
import { FilesService } from '../sales/files.service';
import { activeMessage, attachmentSelect, canPost, conversationScope } from './messaging.service';
import { detectMessageFile, FileTypeError } from './file-types';
import { MalwareScanner, type ScanResult } from './scanner';

const maxScanAttempts = 5;
const draftLimit = 20;
const draftTtlMs = 24 * 3600_000;
const blocked: Partial<Record<AttachmentScanStatus, string>> = { PENDING: 'Güvenlik taraması sürüyor; biraz sonra tekrar deneyin', INFECTED: 'Dosyada zararlı içerik tespit edildi; indirilemez', FAILED: 'Güvenlik taraması tamamlanamadı; dosya indirilemez' };

@Injectable()
export class MessageAttachmentsService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>; private running = false;
  constructor(private readonly prisma: PrismaService, private readonly files: FilesService, private readonly scanner: MalwareScanner) {}
  onModuleInit() { if (process.env.NODE_ENV !== 'test') { this.timer = setInterval(() => { void this.tick().catch(() => console.error('Attachment scan cycle failed; pending files stay blocked')); }, 30_000); this.timer.unref(); } }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async conversation(actor: Actor, id: string) {
    const row = await this.prisma.conversation.findFirst({ where: { AND: [{ id }, conversationScope(actor)] }, select: { id: true, kind: true, archivedAt: true, postingRestricted: true, companyId: true, opportunityId: true, projectId: true } });
    if (!row) throw new NotFoundException('Konuşma bulunamadı');
    return row;
  }
  /** Scanning happens before the file touches the disk: infected uploads are refused outright. If the scanner cannot answer, the file is kept blocked as PENDING and retried. */
  async upload(actor: Actor, conversationId: string, rawName: unknown, body: unknown) {
    if (!Buffer.isBuffer(body) || !body.length) throw new BadRequestException('Dosya application/octet-stream olarak gönderilmelidir');
    if (body.length > messageAttachmentMaxBytes) throw new PayloadTooLargeException('Dosya en fazla 20 MB olabilir');
    const name = attachmentNameSchema.safeParse(rawName);
    if (!name.success) throw new BadRequestException(name.error.issues[0]?.message ?? 'Geçersiz dosya adı');
    const conversation = await this.conversation(actor, conversationId);
    if (conversation.archivedAt) throw new ConflictException('Arşivlenmiş konuşmaya dosya eklenemez');
    if (!await canPost(this.prisma, actor, conversation)) throw new ForbiddenException('Bu konuşmaya yazma yetkiniz yok');
    if (await this.prisma.messageAttachment.count({ where: { conversationId, uploadedById: actor.id, messageId: null } }) >= draftLimit) throw new ConflictException('Gönderilmemiş dosya sınırına ulaşıldı; önce mesajı gönderin veya dosyaları kaldırın');
    let type;
    try { type = detectMessageFile(body, name.data); } catch (error) { if (error instanceof FileTypeError) throw new BadRequestException(error.message); throw error; }
    let verdict: ScanResult | undefined;
    try { verdict = await this.scanner.scan(body); } catch { verdict = undefined; }
    if (verdict?.status === 'INFECTED') {
      await audit(this.prisma, actor.id, 'MALWARE_BLOCKED', 'message_attachment', undefined, { conversationId, mimeType: type.mimeType, size: body.length, signature: verdict.signature });
      throw new BadRequestException('Dosyada zararlı içerik tespit edildi; yüklenmedi');
    }
    const stored = await this.files.store(body, type.extension);
    const row = await this.prisma.messageAttachment.create({ data: { conversationId, uploadedById: actor.id, name: name.data, mimeType: type.mimeType, size: body.length, fileKey: stored.key, checksum: stored.checksum, scanStatus: verdict?.status ?? 'PENDING', scanAttempts: 1, scannedAt: verdict ? new Date() : null }, select: attachmentSelect });
    await audit(this.prisma, actor.id, 'CREATE', 'message_attachment', row.id, { conversationId, mimeType: type.mimeType, size: body.length, scan: row.scanStatus });
    return row;
  }
  async removeDraft(actor: Actor, id: string) {
    const row = await this.prisma.messageAttachment.findFirst({ where: { id, uploadedById: actor.id, messageId: null } });
    if (!row) throw new NotFoundException('Dosya bulunamadı');
    await this.prisma.messageAttachment.delete({ where: { id } });
    await this.removeIfUnreferenced(row.fileKey);
    return { ok: true };
  }
  /** The conversation's “Dosyalar” view: files of sent messages only, newest first. */
  async list(actor: Actor, conversationId: string) {
    await this.conversation(actor, conversationId);
    return this.prisma.messageAttachment.findMany({ where: { conversationId, removedAt: null, message: activeMessage }, orderBy: { createdAt: 'desc' }, take: 200,
      select: { ...attachmentSelect, createdAt: true, uploadedBy: { select: { id: true, name: true } }, message: { select: { id: true, seq: true, parentId: true } } } });
  }
  /**
   * Visible to everyone who can see the conversation once sent; before that only to the uploader. Only scanned files are
   * released, and never once the message was deleted, hidden or expired, or the file removed by retention.
   */
  async download(actor: Actor, id: string) {
    const row = await this.prisma.messageAttachment.findFirst({ where: { id, removedAt: null, conversation: conversationScope(actor), OR: [{ message: activeMessage }, { messageId: null, uploadedById: actor.id }] } });
    if (!row) throw new NotFoundException('Dosya bulunamadı');
    const reason = row.scanStatus === 'UNSCANNED' && process.env.NODE_ENV === 'production' ? blocked.PENDING : blocked[row.scanStatus];
    if (reason) throw new ConflictException(reason);
    return { name: row.name, mimeType: row.mimeType, bytes: await this.files.read(row.fileKey, row.checksum) };
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try { await this.scanPending(); await this.cleanupDrafts(); } finally { this.running = false; }
  }
  /** Retries files the scanner could not judge; with clamd configured, files uploaded while scanning was off are scanned too. */
  async scanPending(limit = 20) {
    const statuses: AttachmentScanStatus[] = this.scanner.kind === 'clamd' ? ['PENDING', 'UNSCANNED'] : ['PENDING'];
    const rows = await this.prisma.messageAttachment.findMany({ where: { scanStatus: { in: statuses } }, orderBy: { createdAt: 'asc' }, take: limit });
    for (const row of rows) {
      let verdict: ScanResult;
      try { verdict = await this.scanner.scan(await this.files.read(row.fileKey, row.checksum)); }
      catch {
        const attempts = row.scanAttempts + 1;
        await this.prisma.messageAttachment.update({ where: { id: row.id }, data: { scanAttempts: attempts, ...(attempts >= maxScanAttempts ? { scanStatus: 'FAILED', scannedAt: new Date() } : {}) } });
        continue;
      }
      if (verdict.status === 'UNSCANNED') continue;
      await this.prisma.messageAttachment.update({ where: { id: row.id }, data: { scanStatus: verdict.status, scanSignature: verdict.status === 'INFECTED' ? verdict.signature : null, scannedAt: new Date(), scanAttempts: { increment: 1 } } });
      if (verdict.status === 'INFECTED') {
        await audit(this.prisma, null, 'MALWARE_DETECTED', 'message_attachment', row.id, { conversationId: row.conversationId, signature: verdict.signature });
        await this.removeIfUnreferenced(row.fileKey);
      }
    }
    return rows.length;
  }
  /** Files attached but never sent are removed after a day. */
  async cleanupDrafts(now = Date.now()) {
    const rows = await this.prisma.messageAttachment.findMany({ where: { messageId: null, createdAt: { lt: new Date(now - draftTtlMs) } }, take: 200 });
    for (const row of rows) {
      await this.prisma.messageAttachment.deleteMany({ where: { id: row.id, messageId: null } });
      await this.removeIfUnreferenced(row.fileKey);
    }
    return rows.length;
  }
  private removeIfUnreferenced(key: string) { return removeIfUnreferenced(this.prisma, this.files, key); }
}

/** Storage is content-addressed and shared with quote PDFs and knowledge files, so a file is deleted only when nothing usable points to it. */
export async function removeIfUnreferenced(prisma: PrismaService, files: FilesService, key: string) {
  const where: Prisma.MessageAttachmentWhereInput = { fileKey: key, scanStatus: { not: 'INFECTED' }, removedAt: null };
  const [messages, knowledge, quotes] = await Promise.all([prisma.messageAttachment.count({ where }), prisma.knowledgeAttachment.count({ where: { fileKey: key } }), prisma.quoteVersion.count({ where: { pdfKey: key } })]);
  if (!messages && !knowledge && !quotes) await files.remove(key);
}
