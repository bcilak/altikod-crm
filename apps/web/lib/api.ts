import { activitySchema, activityPatchSchema, companySchema, companyPatchSchema, contactSchema, contactPatchSchema, inviteSchema, loginSchema, meetingSchema, meetingPatchSchema, opportunitySchema, opportunityPatchSchema, taskSchema, taskPatchSchema, tokenPasswordSchema, transitionSchema, userPatchSchema } from '@saleshub/shared';
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
let csrfToken = '';
export const setCsrf = (value: string) => { csrfToken = value; };
export async function api<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const createSchemas = { '/auth/login': loginSchema, '/auth/invitation/accept': tokenPasswordSchema, '/auth/password-reset/confirm': tokenPasswordSchema, '/users/invitations': inviteSchema, '/companies': companySchema, '/activities': activitySchema, '/tasks': taskSchema, '/meetings': meetingSchema, '/opportunities': opportunitySchema };
  const schema = method === 'POST' ? createSchemas[path as keyof typeof createSchemas] ?? (/^\/companies\/[^/]+\/contacts$/.test(path) ? contactSchema : /\/stage-transitions$/.test(path) ? transitionSchema : undefined) : method === 'PATCH' ? /^\/companies\/[^/]+\/contacts\/[^/]+$/.test(path) ? contactPatchSchema : /^\/companies\/[^/]+$/.test(path) ? companyPatchSchema : /^\/activities\//.test(path) ? activityPatchSchema : /^\/tasks\//.test(path) ? taskPatchSchema : /^\/meetings\//.test(path) ? meetingPatchSchema : /^\/opportunities\//.test(path) ? opportunityPatchSchema : /^\/users\//.test(path) ? userPatchSchema : undefined : undefined;
  if (schema) { const parsed = schema.safeParse(body); if (!parsed.success) throw new ApiError(400, parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(' · ')); body = parsed.data; }
  const response = await fetch(`/api/v1${path}`, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error?.message ?? 'İşlem tamamlanamadı');
  return data;
}
/** Sends a file as raw bytes; the server detects the real type and enforces the size limit. */
export async function upload<T = unknown>(path: string, file: File): Promise<T> {
  const response = await fetch(`/api/v1${path}?name=${encodeURIComponent(file.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) }, body: file, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, response.status === 413 ? 'Dosya en fazla 5 MB olabilir' : data.error?.message ?? 'Dosya yüklenemedi');
  return data;
}
export type Me = { id: string; name: string; email: string; role: 'ADMIN' | 'MANAGER' | 'SALES' | 'TECHNICAL' | 'VIEWER'; csrfToken: string };
export type Person = { id: string; name: string; role: string };
export type Contact = { id: string; firstName: string; lastName: string; title?: string; email?: string; phone?: string; decisionMaker: boolean; preferences?: string };
export type Company = { id: string; displayName: string; legalName: string; domain?: string; sector?: string; website?: string; phone?: string; address?: string; type: string; source?: string; status: string; tags: string[]; notes?: string; ownerId: string; archivedAt?: string; owner?: Person; contacts?: Contact[]; canWrite?: boolean; canShare?: boolean; duplicateWarnings?: { id: string; displayName: string }[] };
export type Opportunity = { id: string; companyId: string; ownerId: string; title: string; stage: string; estimatedValue: string; currency: string; probability: number; nextActionAt: string; expectedCloseAt?: string; version: number; source?: string; competitor?: string; products: string[]; lostReason?: string; wonReason?: string; company?: Company; owner?: Person; canWrite?: boolean; history?: { id: string; fromStage?: string; toStage: string; changedAt: string; note?: string }[] };
export type Task = { id: string; companyId: string; opportunityId?: string; assigneeId: string; title: string; description?: string; dueAt: string; reminderAt?: string; priority: string; status: string; version: number; company: Company; assignee: Person };
export type Meeting = { id: string; companyId: string; opportunityId?: string; title: string; startsAt: string; endsAt: string; timezone: string; agenda?: string; notes?: string; outcome?: string; location?: string; company: Company; attendees: { userId?: string; contactId?: string; externalEmail?: string }[] };
export type Activity = { id: string; companyId: string; opportunityId?: string; contactId?: string; type: string; summary: string; outcome?: string; happenedAt: string; source: string; company: Company };
export type Page<T> = { items: T[]; total: number; page?: number };
export const stageLabels: Record<string, string> = { NEW_LEAD: 'Yeni fırsat', QUALIFICATION: 'Ön değerlendirme', NEEDS_ANALYSIS: 'İhtiyaç analizi', SOLUTION_DESIGN: 'Çözüm tasarımı', PROPOSAL: 'Teklif', NEGOTIATION: 'Müzakere', WON: 'Kazanıldı', LOST: 'Kaybedildi' };
export const taskLabels: Record<string, string> = { OPEN: 'Açık', IN_PROGRESS: 'Sürüyor', DONE: 'Tamamlandı', CANCELLED: 'İptal' };
export const activityLabels: Record<string, string> = { CALL: 'Arama', EMAIL: 'E-posta', WHATSAPP: 'WhatsApp', VISIT: 'Ziyaret', ONLINE_MEETING: 'Çevrim içi toplantı', NOTE: 'İç not' };
export const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
export const inputDate = (value?: string) => value ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)).replace(' ', 'T') : '';
export const money = (value: string, currency: string) => { const [whole = '0', fraction = ''] = value.split('.'); return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction.replace(/0+$/, '').padEnd(2, '0')} ${currency}`; };
