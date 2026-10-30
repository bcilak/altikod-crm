import { z } from 'zod';

export const roles = ['ADMIN', 'MANAGER', 'SALES', 'TECHNICAL', 'VIEWER'] as const;
export const stages = ['NEW_LEAD', 'QUALIFICATION', 'NEEDS_ANALYSIS', 'SOLUTION_DESIGN', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;
export const stageLabels: Record<typeof stages[number], string> = { NEW_LEAD: 'Yeni fırsat', QUALIFICATION: 'Ön değerlendirme', NEEDS_ANALYSIS: 'İhtiyaç analizi', SOLUTION_DESIGN: 'Çözüm tasarımı', PROPOSAL: 'Teklif', NEGOTIATION: 'Müzakere', WON: 'Kazanıldı', LOST: 'Kaybedildi' };
export const uuid = z.string().uuid();
const short = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(2000).nullable().optional();
export const dateTime = z.string().datetime({ offset: true });
export const email = z.string().trim().toLowerCase().email().max(254);
export const password = z.string().min(12).max(128);
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const inviteSchema = z.object({ email, name: short, role: z.enum(roles) }).strict();
export const tokenPasswordSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password }).strict();
export const userPatchSchema = z.object({ name: short.optional(), role: z.enum(roles).optional(), isActive: z.boolean().optional() }).strict();
export const companySchema = z.object({
  displayName: short, legalName: short, domain: z.string().trim().toLowerCase().max(253).regex(/^[a-z0-9.-]+$/).nullable().optional(),
  sector: optionalText, website: z.string().url().max(500).nullable().optional(), phone: optionalText, address: optionalText,
  type: z.enum(['CUSTOMER', 'PARTNER', 'SUPPLIER']).default('CUSTOMER'), source: optionalText,
  status: z.enum(['ACTIVE', 'PROSPECT', 'INACTIVE']).default('ACTIVE'), tags: z.array(short).max(20).default([]), notes: optionalText,
}).strict();
export const companyPatchSchema = companySchema.partial().extend({ ownerId: uuid.optional(), type: companySchema.shape.type.removeDefault().optional(), status: companySchema.shape.status.removeDefault().optional(), tags: companySchema.shape.tags.removeDefault().optional() }).strict();
export const contactSchema = z.object({ firstName: short, lastName: short, title: optionalText, email: email.nullable().optional(), phone: optionalText, decisionMaker: z.boolean().default(false), preferences: optionalText }).strict();
export const contactPatchSchema = contactSchema.partial().extend({ archived: z.boolean().optional(), decisionMaker: z.boolean().optional() }).strict();
export const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(), companyId: uuid.optional(), opportunityId: uuid.optional(), ownerId: uuid.optional(),
  assigneeId: uuid.optional(), status: z.string().max(40).optional(), stage: z.enum(stages).optional(),
  overdue: z.enum(['true', 'false']).optional(), archived: z.enum(['true', 'false']).optional(),
  from: dateTime.optional(), to: dateTime.optional(), sort: z.enum(['newest', 'oldest', 'name']).default('newest'),
}).strict();
export const activitySchema = z.object({ companyId: uuid, opportunityId: uuid.nullable().optional(), contactId: uuid.nullable().optional(),
  type: z.enum(['CALL', 'EMAIL', 'WHATSAPP', 'VISIT', 'ONLINE_MEETING', 'NOTE']), summary: z.string().trim().min(1).max(5000), outcome: optionalText, happenedAt: dateTime,
}).strict();
export const activityPatchSchema = activitySchema.omit({ companyId: true }).partial().strict();
export const taskSchema = z.object({ companyId: uuid, opportunityId: uuid.nullable().optional(), assigneeId: uuid, title: short, description: optionalText,
  dueAt: dateTime, reminderAt: dateTime.nullable().optional(), priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
}).strict();
export const taskPatchSchema = taskSchema.omit({ companyId: true }).partial().extend({ version: z.number().int().positive(), status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(), priority: taskSchema.shape.priority.removeDefault().optional() }).strict();
const attendeeSchema = z.object({ userId: uuid.optional(), contactId: uuid.optional(), externalEmail: email.optional() }).strict().refine(a => [a.userId, a.contactId, a.externalEmail].filter(Boolean).length === 1, 'Exactly one attendee identity required');
export const meetingSchema = z.object({ companyId: uuid, opportunityId: uuid.nullable().optional(), title: short, startsAt: dateTime, endsAt: dateTime,
  timezone: z.string().refine(value => { try { new Intl.DateTimeFormat('tr', { timeZone: value }); return true; } catch { return false; } }).default('Europe/Istanbul'),
  agenda: optionalText, notes: optionalText, outcome: optionalText, location: optionalText, attendees: z.array(attendeeSchema).max(50).default([]),
}).strict();
export const meetingPatchSchema = meetingSchema.omit({ companyId: true }).partial().extend({ timezone: meetingSchema.shape.timezone.removeDefault().optional(), attendees: meetingSchema.shape.attendees.removeDefault().optional() }).strict();
export const opportunitySchema = z.object({ companyId: uuid, ownerId: uuid.optional(), title: short,
  estimatedValue: z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/), currency: z.enum(['TRY', 'USD', 'EUR', 'GBP']),
  probability: z.number().int().min(0).max(100), expectedCloseAt: dateTime.nullable().optional(), nextActionAt: dateTime,
  source: optionalText, competitor: optionalText, products: z.array(short).max(30).default([]),
}).strict();
export const opportunityPatchSchema = opportunitySchema.omit({ companyId: true }).partial().extend({ version: z.number().int().positive(), products: opportunitySchema.shape.products.removeDefault().optional() }).strict();
export const transitionSchema = z.object({ stage: z.enum(stages), version: z.number().int().positive(), reason: z.string().trim().min(1).max(2000).optional(), nextActionAt: dateTime.optional() }).strict();
export function istanbulDate(value: string) { return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
