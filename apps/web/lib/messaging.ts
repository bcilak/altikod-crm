export { conversationKindLabels, messageMaxLength } from '@saleshub/shared';

export type ConversationKind = 'CHANNEL' | 'GROUP' | 'DIRECT' | 'RECORD';
export type RecordType = 'COMPANY' | 'OPPORTUNITY' | 'PROJECT';
export type Author = { id: string; name: string; isActive: boolean };
export type Conversation = { id: string; kind: ConversationKind; name: string | null; topic: string; isPublic: boolean; postingRestricted: boolean; archivedAt: string | null; lastSeq: number; lastMessageAt: string | null;
  record: { type: RecordType; id: string; title: string } | null; directUser: Author | null; joined: boolean; myRole: 'OWNER' | 'MEMBER' | null; memberCount: number | null; unread: number };
export type ConversationDetail = Conversation & { canPost: boolean; canManage: boolean; members: (Author & { role: 'OWNER' | 'MEMBER' })[] };
export type ConversationList = { items: Conversation[]; unreadTotal: number };
export type Message = { id: string; seq: number; parentId: string | null; body: string; createdAt: string; author: Author; replyCount: number };
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
