import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { z } from 'zod';
import { attachmentMaxBytes, attachmentNameSchema, knowledgeActionSchema, knowledgeContentSchema, knowledgeCreateSchema, knowledgeEditSchema, knowledgeMetaPatchSchema } from '@saleshub/shared';
import { PrismaService } from '../prisma.service';
import { KnowledgeStatus, Prisma } from '../generated/prisma/client';
import { Actor } from '../security/access';
import { audit, can, Db } from '../security/policy';
import { ListQuery, paging } from '../crm/companies.service';
import { FilesService } from '../sales/files.service';

type Content = z.infer<typeof knowledgeContentSchema>;
const contentFields = ['summary', 'productVersion', 'technicalSpecs', 'useCases', 'idealCustomer', 'salesPitch', 'limitations', 'discoveryQuestions', 'objections', 'faq'] as const;
const pick = (source: Record<string, unknown>) => Object.fromEntries(contentFields.map(k => [k, source[k]])) as Content;
const versionSummary = { id: true, version: true, status: true, publishedAt: true, submittedAt: true, createdAt: true, authorId: true, reviewNote: true } as const;
/** Detect the real file type from its first bytes; the client-declared type and name are never trusted. */
export function sniff(bytes: Buffer): { mimeType: 'application/pdf' | 'image/png' | 'image/jpeg'; extension: 'pdf' | 'png' | 'jpg' } | null {
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return { mimeType: 'application/pdf', extension: 'pdf' };
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mimeType: 'image/png', extension: 'png' };
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mimeType: 'image/jpeg', extension: 'jpg' };
  return null;
}

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService, private readonly files: FilesService) {}
  private editor(db: Db, actor: Actor) { return can(db, actor, 'knowledge', 'write'); }
  /** Readers only ever reach articles with a live published version. */
  private readable(editor: boolean): Prisma.KnowledgeArticleWhereInput { return editor ? {} : { publishedVersionId: { not: null }, retiredAt: null }; }

  async list(actor: Actor, q: ListQuery & { category?: string; productId?: string }) {
    const editor = await this.editor(this.prisma, actor);
    const where: Prisma.KnowledgeArticleWhereInput = { AND: [this.readable(editor), { ...(q.category ? { category: q.category } : {}), ...(q.productId ? { productId: q.productId } : {}), ...(q.search ? { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { category: { contains: q.search, mode: 'insensitive' } }, { tags: { has: q.search } }] } : {}) }] };
    const [rows, total, categories] = await this.prisma.$transaction([
      this.prisma.knowledgeArticle.findMany({ where, ...paging(q), orderBy: { title: 'asc' }, include: { product: { select: { id: true, name: true, sku: true } }, versions: { where: { status: { in: editor ? ['PUBLISHED', 'DRAFT', 'IN_REVIEW'] : ['PUBLISHED'] } }, select: { id: true, version: true, status: true, summary: true, publishedAt: true } } } }),
      this.prisma.knowledgeArticle.count({ where }),
      this.prisma.knowledgeArticle.findMany({ where: this.readable(editor), distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } }),
    ]);
    return { items: rows.map(({ versions, ...a }) => ({ ...a, published: versions.find(v => v.status === 'PUBLISHED') ?? null, openVersion: editor ? versions.find(v => v.status !== 'PUBLISHED') ?? null : undefined })), total, categories: categories.map(c => c.category), canEdit: editor };
  }
  async get(actor: Actor, id: string) {
    const editor = await this.editor(this.prisma, actor);
    const article = await this.prisma.knowledgeArticle.findFirst({ where: { AND: [{ id }, this.readable(editor)] }, include: { product: { select: { id: true, name: true, sku: true, status: true } }, owner: { select: { id: true, name: true } }, attachments: { where: { removedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, mimeType: true, size: true, createdAt: true } } } });
    if (!article) throw new NotFoundException('Bilgi kartı bulunamadı');
    const published = article.publishedVersionId ? await this.prisma.knowledgeVersion.findUnique({ where: { id: article.publishedVersionId } }) : null;
    if (!editor) return { ...article, published, canEdit: false, canPublish: false };
    const [openVersion, history, canPublish] = await Promise.all([
      this.prisma.knowledgeVersion.findFirst({ where: { articleId: id, status: { in: ['DRAFT', 'IN_REVIEW'] } } }),
      this.prisma.knowledgeVersion.findMany({ where: { articleId: id }, orderBy: { version: 'desc' }, select: versionSummary }),
      can(this.prisma, actor, 'knowledge', 'publish'),
    ]);
    return { ...article, published, openVersion, history, canEdit: true, canPublish };
  }
  async version(actor: Actor, id: string) {
    if (!await this.editor(this.prisma, actor)) throw new ForbiddenException('Sürüm geçmişi yalnız içerik editörlerine açıktır');
    const row = await this.prisma.knowledgeVersion.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Sürüm bulunamadı');
    return row;
  }
  private async product(db: Db, productId?: string | null) {
    if (productId && !await db.product.findUnique({ where: { id: productId }, select: { id: true } })) throw new NotFoundException('Ürün bulunamadı');
  }
  async create(actor: Actor, input: z.infer<typeof knowledgeCreateSchema>) {
    return this.prisma.$transaction(async db => {
      await this.product(db, input.productId);
      const { content, ...meta } = input;
      const article = await db.knowledgeArticle.create({ data: { ...meta, ownerId: actor.id, versions: { create: { ...content, version: 1, authorId: actor.id } } } });
      await audit(db, actor.id, 'CREATE', 'knowledge_article', article.id);
      return article;
    });
  }
  async patchMeta(actor: Actor, id: string, input: z.infer<typeof knowledgeMetaPatchSchema>) {
    return this.prisma.$transaction(async db => {
      if (!await db.knowledgeArticle.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Bilgi kartı bulunamadı');
      await this.product(db, input.productId);
      const row = await db.knowledgeArticle.update({ where: { id }, data: input });
      await audit(db, actor.id, 'UPDATE', 'knowledge_article', id, { fields: Object.keys(input) });
      return row;
    });
  }
  async revise(actor: Actor, articleId: string) {
    return this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT id FROM "KnowledgeArticle" WHERE id = ${articleId}::uuid FOR UPDATE`;
      const article = await db.knowledgeArticle.findUnique({ where: { id: articleId } });
      if (!article) throw new NotFoundException('Bilgi kartı bulunamadı');
      if (await db.knowledgeVersion.findFirst({ where: { articleId, status: { in: ['DRAFT', 'IN_REVIEW'] } }, select: { id: true } })) throw new ConflictException('Bu kartın zaten açık bir taslağı var');
      const source = await db.knowledgeVersion.findFirstOrThrow({ where: { articleId }, orderBy: { version: 'desc' } });
      const row = await db.knowledgeVersion.create({ data: { ...pick(source), articleId, version: source.version + 1, authorId: actor.id } });
      await audit(db, actor.id, 'KNOWLEDGE_REVISE', 'knowledge_version', row.id, { articleId, from: source.version });
      return row;
    });
  }
  private async lockedVersion(db: Db, id: string, lockVersion: number, expected: KnowledgeStatus) {
    await db.$queryRaw`SELECT id FROM "KnowledgeVersion" WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await db.knowledgeVersion.findUnique({ where: { id }, include: { article: true } });
    if (!row) throw new NotFoundException('Sürüm bulunamadı');
    if (row.lockVersion !== lockVersion) throw new ConflictException('Sürüm başka biri tarafından değiştirildi; sayfayı yenileyin');
    if (row.status !== expected) throw new ConflictException('Sürüm bu işlem için uygun durumda değil');
    return row;
  }
  async edit(actor: Actor, id: string, input: z.infer<typeof knowledgeEditSchema>) {
    return this.prisma.$transaction(async db => {
      const { lockVersion, ...content } = input;
      await this.lockedVersion(db, id, lockVersion, 'DRAFT');
      const row = await db.knowledgeVersion.update({ where: { id }, data: { ...content, lockVersion: { increment: 1 } } });
      await audit(db, actor.id, 'UPDATE', 'knowledge_version', id);
      return row;
    });
  }
  async action(actor: Actor, id: string, action: 'submit' | 'publish' | 'reject', input: z.infer<typeof knowledgeActionSchema>) {
    return this.prisma.$transaction(async db => {
      const row = await this.lockedVersion(db, id, input.lockVersion, action === 'submit' ? 'DRAFT' : 'IN_REVIEW');
      const now = new Date();
      if (action === 'submit') await db.knowledgeVersion.update({ where: { id }, data: { status: 'IN_REVIEW', submittedAt: now, reviewNote: null, lockVersion: { increment: 1 } } });
      if (action === 'reject') {
        if (!input.note) throw new BadRequestException('Geri gönderme gerekçesi zorunludur');
        await db.knowledgeVersion.update({ where: { id }, data: { status: 'DRAFT', reviewerId: actor.id, reviewNote: input.note, lockVersion: { increment: 1 } } });
      }
      if (action === 'publish') {
        if (row.article.retiredAt) throw new ConflictException('Yayından kaldırılmış kart yayınlanamaz; önce geri alın');
        await db.knowledgeVersion.updateMany({ where: { articleId: row.articleId, status: 'PUBLISHED' }, data: { status: 'SUPERSEDED' } });
        await db.knowledgeVersion.update({ where: { id }, data: { status: 'PUBLISHED', reviewerId: actor.id, reviewNote: input.note ?? null, publishedAt: now, lockVersion: { increment: 1 } } });
        await db.knowledgeArticle.update({ where: { id: row.articleId }, data: { publishedVersionId: id } });
      }
      await audit(db, actor.id, `KNOWLEDGE_${action.toUpperCase()}`, 'knowledge_version', id, { articleId: row.articleId, version: row.version });
      return db.knowledgeVersion.findUniqueOrThrow({ where: { id } });
    });
  }
  async retire(actor: Actor, id: string, retired: boolean) {
    return this.prisma.$transaction(async db => {
      if (!await db.knowledgeArticle.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Bilgi kartı bulunamadı');
      const row = await db.knowledgeArticle.update({ where: { id }, data: { retiredAt: retired ? new Date() : null } });
      await audit(db, actor.id, retired ? 'KNOWLEDGE_RETIRE' : 'KNOWLEDGE_RESTORE', 'knowledge_article', id);
      return row;
    });
  }
  async upload(actor: Actor, articleId: string, rawName: unknown, body: unknown) {
    if (!Buffer.isBuffer(body) || !body.length) throw new BadRequestException('Dosya application/octet-stream olarak gönderilmelidir');
    if (body.length > attachmentMaxBytes) throw new PayloadTooLargeException('Dosya en fazla 5 MB olabilir');
    const name = attachmentNameSchema.safeParse(rawName);
    if (!name.success) throw new BadRequestException(name.error.issues[0]?.message ?? 'Geçersiz dosya adı');
    const type = sniff(body);
    if (!type) throw new BadRequestException('Yalnız PDF, PNG veya JPEG dosyaları eklenebilir');
    const article = await this.prisma.knowledgeArticle.findUnique({ where: { id: articleId }, select: { id: true, _count: { select: { attachments: { where: { removedAt: null } } } } } });
    if (!article) throw new NotFoundException('Bilgi kartı bulunamadı');
    if (article._count.attachments >= 20) throw new ConflictException('Bir karta en fazla 20 dosya eklenebilir');
    const stored = await this.files.store(body, type.extension);
    return this.prisma.$transaction(async db => {
      const row = await db.knowledgeAttachment.create({ data: { articleId, name: name.data, mimeType: type.mimeType, size: body.length, fileKey: stored.key, checksum: stored.checksum, uploadedBy: actor.id }, select: { id: true, name: true, mimeType: true, size: true, createdAt: true } });
      await audit(db, actor.id, 'CREATE', 'knowledge_attachment', row.id, { articleId, mimeType: type.mimeType, size: body.length });
      return row;
    });
  }
  async removeAttachment(actor: Actor, id: string) {
    return this.prisma.$transaction(async db => {
      const row = await db.knowledgeAttachment.findFirst({ where: { id, removedAt: null } });
      if (!row) throw new NotFoundException('Dosya bulunamadı');
      await db.knowledgeAttachment.update({ where: { id }, data: { removedAt: new Date() } });
      await audit(db, actor.id, 'DELETE', 'knowledge_attachment', id, { articleId: row.articleId });
      return { ok: true };
    });
  }
  async download(actor: Actor, id: string) {
    const editor = await this.editor(this.prisma, actor);
    const row = await this.prisma.knowledgeAttachment.findFirst({ where: { id, removedAt: null, article: this.readable(editor) } });
    if (!row) throw new NotFoundException('Dosya bulunamadı');
    return { name: row.name, mimeType: row.mimeType, bytes: await this.files.read(row.fileKey, row.checksum) };
  }
}
