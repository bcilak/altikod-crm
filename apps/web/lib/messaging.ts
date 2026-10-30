export { attachmentScanLabels, conversationKindLabels, messageAttachmentAccept, messageAttachmentMaxBytes, messageAttachmentsPerMessage, messageEditWindowMs, messageMaxLength, messageStateLabels } from '@saleshub/shared';

export type ConversationKind = 'CHANNEL' | 'GROUP' | 'DIRECT' | 'RECORD';
export type RecordType = 'COMPANY' | 'OPPORTUNITY' | 'PROJECT';
export type Author = { id: string; name: string; isActive: boolean };
export type Conversation = { id: string; kind: ConversationKind; name: string | null; topic: string; isPublic: boolean; postingRestricted: boolean; archivedAt: string | null; lastSeq: number; lastMessageAt: string | null;
  record: { type: RecordType; id: string; title: string } | null; directUser: Author | null; joined: boolean; myRole: 'OWNER' | 'MEMBER' | null; memberCount: number | null; unread: number; mutedUntil: string | null };
export type ConversationDetail = Conversation & { canPost: boolean; canManage: boolean; canModerate: boolean; canSuggestKnowledge: boolean; members: (Author & { role: 'OWNER' | 'MEMBER' })[] };
export type ConversationList = { items: Conversation[]; unreadTotal: number };
export type Attachment = { id: string; name: string; mimeType: string; size: number; scanStatus: 'PENDING' | 'CLEAN' | 'INFECTED' | 'FAILED' | 'UNSCANNED' };
export type SharedFile = Attachment & { createdAt: string; uploadedBy: { id: string; name: string }; message: { id: string; seq: number; parentId: string | null } };
export type Mention = { id: string; name: string };
export type Message = { id: string; seq: number; parentId: string | null; body: string; createdAt: string; author: Author; replyCount: number; attachments: Attachment[]; mentions: Mention[];
  state: 'ACTIVE' | 'DELETED' | 'HIDDEN' | 'EXPIRED'; editedAt: string | null; pinnedAt: string | null; hiddenReason: string | null };
export type SearchHit = { message: Message; conversation: { id: string; kind: ConversationKind; name: string | null; record: Conversation['record'] } };
/** The server re-checks scan state on every download; this only decides whether to offer a link. */
export const downloadable = (a: Attachment) => a.scanStatus === 'CLEAN' || a.scanStatus === 'UNSCANNED';
export const attachmentUrl = (id: string, inline = false) => `/api/v1/messaging/attachments/${id}${inline ? '?inline=1' : ''}`;
export const filesKey = (conversationId: string) => [`/messaging/conversations/${conversationId}/attachments`];
export const pinsKey = (conversationId: string) => [`/messaging/conversations/${conversationId}/pins`];
export type MessagePage = { items: Message[]; hasMore: boolean; lastSeq: number; readSeq: number };
export type Colleague = { id: string; name: string; role: string };

export const conversationsKey = ['/messaging/conversations'];
/** Polling until live updates (F8-05): the open conversation every 10 s, the list and unread badge every 15 s. */
export const listInterval = 15_000;
export const threadInterval = 10_000;
export const recordPath: Record<RecordType, string> = { COMPANY: '/companies', OPPORTUNITY: '/opportunities', PROJECT: '/projects' };
export const recordLabels: Record<RecordType, string> = { COMPANY: 'Firma', OPPORTUNITY: 'Fırsat', PROJECT: 'Proje' };
export const roleLabels: Record<string, string> = { ADMIN: 'Yönetici', MANAGER: 'Satış yöneticisi', SALES: 'Satış', TECHNICAL: 'Teknik', VIEWER: 'Görüntüleyici' };
/** A fresh idempotency key per draft; it is reused when the same draft is retried. */
export const newNonce = () => crypto.randomUUID().replaceAll('-', '');
export const displayName = (c: Pick<Conversation, 'kind' | 'name'>) => c.kind === 'CHANNEL' ? `#${c.name}` : c.name ?? 'Konuşma';
