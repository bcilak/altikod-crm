import { z } from 'zod';
import { dateTime, listSchema, uuid } from './crm';

const short = z.string().trim().min(1).max(200);
const long = (max: number) => z.string().max(max);

export const projectStatuses = ['PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const;
export const projectStatusLabels: Record<typeof projectStatuses[number], string> = { PLANNED: 'Planlandı', IN_PROGRESS: 'Sürüyor', ON_HOLD: 'Beklemede', COMPLETED: 'Tamamlandı', CANCELLED: 'İptal edildi' };
/** Allowed project status moves; COMPLETED may be reopened by a writer, CANCELLED is final. */
export const projectTransitions: Record<typeof projectStatuses[number], readonly (typeof projectStatuses[number])[]> = {
  PLANNED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'], IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'], ON_HOLD: ['IN_PROGRESS', 'CANCELLED'], COMPLETED: ['IN_PROGRESS'], CANCELLED: [],
};
export const projectPatchSchema = z.object({ version: z.number().int().positive(), title: short.optional(), status: z.enum(projectStatuses).optional(), ownerId: uuid.optional(), startAt: dateTime.nullable().optional(), dueAt: dateTime.optional() }).strict();
export const milestoneSchema = z.object({ title: short, dueAt: dateTime }).strict();
export const milestonePatchSchema = z.object({ title: short.optional(), dueAt: dateTime.optional(), completed: z.boolean().optional() }).strict();
export const projectTaskSchema = z.object({ assigneeId: uuid, title: short, description: z.string().trim().max(2000).nullable().optional(), dueAt: dateTime, priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL') }).strict();

export const knowledgeStatusLabels: Record<string, string> = { DRAFT: 'Taslak', IN_REVIEW: 'İncelemede', PUBLISHED: 'Yayında', SUPERSEDED: 'Eski sürüm' };
const pair = <A extends string, B extends string>(a: A, b: B) => z.object({ [a]: z.string().trim().min(1).max(1000), [b]: z.string().trim().min(1).max(3000) } as Record<A | B, z.ZodString>).strict();
export const knowledgeContentSchema = z.object({
  summary: z.string().trim().min(1).max(2000), productVersion: z.string().trim().max(100).nullable().optional(),
  technicalSpecs: long(10000).default(''), useCases: long(5000).default(''), idealCustomer: long(3000).default(''), salesPitch: long(3000).default(''), limitations: long(5000).default(''),
  discoveryQuestions: z.array(z.string().trim().min(1).max(500)).max(40).default([]),
  objections: z.array(pair('objection', 'answer')).max(40).default([]),
  faq: z.array(pair('question', 'answer')).max(40).default([]),
}).strict();
export const knowledgeMetaSchema = z.object({ title: short, category: z.string().trim().min(1).max(100), tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]), productId: uuid.nullable().optional() }).strict();
export const knowledgeCreateSchema = knowledgeMetaSchema.extend({ content: knowledgeContentSchema }).strict();
export const knowledgeMetaPatchSchema = knowledgeMetaSchema.partial().extend({ tags: knowledgeMetaSchema.shape.tags.removeDefault().optional() }).strict();
export const knowledgeEditSchema = knowledgeContentSchema.extend({ lockVersion: z.number().int().positive() }).strict();
export const knowledgeActionSchema = z.object({ lockVersion: z.number().int().positive(), note: z.string().trim().min(1).max(2000).optional() }).strict();
export const attachmentTypes = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' } as const;
export const attachmentMaxBytes = 5 * 1024 * 1024;
export const attachmentNameSchema = z.string().trim().min(1).max(150).refine(v => !/[\\/:*?"<>|]/.test(v) && [...v].every(c => c.charCodeAt(0) >= 32), 'Dosya adında / \\ : * ? " < > | ve kontrol karakterleri kullanılamaz');

export const courseStatusLabels: Record<string, string> = { DRAFT: 'Taslak', PUBLISHED: 'Yayında', ARCHIVED: 'Arşivlendi' };
export const courseSchema = z.object({ title: short, description: long(3000).default(''), productId: uuid.nullable().optional() }).strict();
export const coursePatchSchema = courseSchema.partial().extend({ version: z.number().int().positive(), description: long(3000).optional(), status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional() }).strict();
export const quizQuestionSchema = z.object({ prompt: z.string().trim().min(1).max(500), options: z.array(z.string().trim().min(1).max(300)).min(2).max(6), correctIndex: z.number().int().min(0) }).strict()
  .refine(q => q.correctIndex < q.options.length, { message: 'Doğru cevap seçeneklerden biri olmalı', path: ['correctIndex'] });
export const lessonSchema = z.object({ title: short, body: z.string().trim().min(1).max(20000), articleId: uuid.nullable().optional(), passPct: z.number().int().min(0).max(100).default(80), questions: z.array(quizQuestionSchema).max(20).default([]) }).strict();
export const lessonPatchSchema = lessonSchema.partial().extend({ passPct: z.number().int().min(0).max(100).optional(), questions: z.array(quizQuestionSchema).max(20).optional() }).strict();
export const lessonAttemptSchema = z.object({ answers: z.array(z.number().int().min(0).max(5)).max(20).default([]) }).strict();
export const knowledgeListSchema = listSchema.extend({ category: z.string().trim().max(100).optional(), productId: uuid.optional() }).strict();
