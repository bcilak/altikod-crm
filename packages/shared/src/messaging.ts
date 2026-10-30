import { z } from 'zod';
import { uuid } from './crm';

export const conversationKinds = ['CHANNEL', 'GROUP', 'DIRECT', 'RECORD'] as const;
export const conversationKindLabels: Record<typeof conversationKinds[number], string> = { CHANNEL: 'Kanal', GROUP: 'Özel grup', DIRECT: 'Birebir', RECORD: 'Kayıt konuşması' };
export const conversationRecordTypes = ['COMPANY', 'OPPORTUNITY', 'PROJECT'] as const;
export const messageMaxLength = 4000;
export const groupMaxMembers = 50;
/** Product owner default (F8-01): no ZIP, no macro-enabled Office files; type is decided from content, never from the name alone. */
export const messageAttachmentTypes = {
  'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/csv': 'csv', 'text/plain': 'txt',
} as const;
export type MessageAttachmentExtension = typeof messageAttachmentTypes[keyof typeof messageAttachmentTypes];
export const messageAttachmentAccept = '.pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx,.csv,.txt';
export const messageAttachmentMaxBytes = 20 * 1024 * 1024;
export const messageAttachmentsPerMessage = 5;
export const messageMentionsPerMessage = 20;
export const messageNotificationLabels: Record<string, string> = { MESSAGE_MENTION: 'Sizden bahsedildi', MESSAGE_DIRECT: 'Yeni birebir mesaj', MESSAGE_REPLY: 'Mesaj dizinize yanıt geldi' };
export const attachmentScanLabels: Record<string, string> = { PENDING: 'Güvenlik taraması sürüyor', CLEAN: 'Tarandı', INFECTED: 'Zararlı içerik tespit edildi; indirilemez', FAILED: 'Tarama tamamlanamadı; indirilemez', UNSCANNED: 'Taranmadı (yalnız geliştirme ortamı)' };

const name = z.string().trim().min(1).max(80);
const topic = z.string().trim().max(500);
const memberIds = z.array(uuid).max(groupMaxMembers - 1);
/** Plain text only: newlines and tabs allowed, other control characters rejected. Rendering escapes it. Empty only when files are attached. */
export const messageBodySchema = z.string().trim().max(messageMaxLength).refine(v => [...v].every(c => { const code = c.charCodeAt(0); return code >= 32 || code === 9 || code === 10 || code === 13; }), 'Mesajda kontrol karakteri kullanılamaz');

export const channelCreateSchema = z.object({ kind: z.literal('CHANNEL'), name, topic: topic.default(''), isPublic: z.boolean().default(true), postingRestricted: z.boolean().default(false), memberIds: memberIds.default([]) }).strict();
export const groupCreateSchema = z.object({ kind: z.literal('GROUP'), name, topic: topic.default(''), memberIds: memberIds.min(1) }).strict();
export const conversationCreateSchema = z.discriminatedUnion('kind', [channelCreateSchema, groupCreateSchema]);
export const conversationPatchSchema = z.object({ name: name.optional(), topic: topic.optional(), postingRestricted: z.boolean().optional(), archived: z.boolean().optional() }).strict();
export const directConversationSchema = z.object({ userId: uuid }).strict();
export const recordConversationSchema = z.object({ recordType: z.enum(conversationRecordTypes), recordId: uuid }).strict();
export const conversationMembersSchema = z.object({ userIds: z.array(uuid).min(1).max(groupMaxMembers - 1) }).strict();
export const conversationListSchema = z.object({ kind: z.enum(conversationKinds).optional() }).strict();
/** clientNonce makes retries idempotent: the same author and nonce always yield the same message. */
export const messageCreateSchema = z.object({ body: messageBodySchema.default(''), parentId: uuid.optional(), clientNonce: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/), attachmentIds: z.array(uuid).max(messageAttachmentsPerMessage).default([]), mentionIds: z.array(uuid).max(messageMentionsPerMessage).default([]) }).strict()
  .refine(m => m.body.length > 0 || m.attachmentIds.length > 0, { message: 'Mesaj metni veya dosya gerekli', path: ['body'] })
  .refine(m => new Set(m.attachmentIds).size === m.attachmentIds.length, { message: 'Aynı dosya iki kez eklenemez', path: ['attachmentIds'] })
  .refine(m => new Set(m.mentionIds).size === m.mentionIds.length, { message: 'Aynı kişi iki kez bahsedilemez', path: ['mentionIds'] });
export const messageListSchema = z.object({ beforeSeq: z.coerce.number().int().positive().optional(), afterSeq: z.coerce.number().int().min(0).optional(), parentId: uuid.optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict()
  .refine(q => q.beforeSeq === undefined || q.afterSeq === undefined, 'beforeSeq ve afterSeq birlikte kullanılamaz');
export const conversationReadSchema = z.object({ seq: z.number().int().min(0) }).strict();
