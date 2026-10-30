import type { Person } from './api';
export { projectStatusLabels, projectTransitions, knowledgeStatusLabels, courseStatusLabels } from '@saleshub/shared';

export type Milestone = { id: string; title: string; dueAt: string; completedAt: string | null; position: number };
export type ProjectTask = { id: string; title: string; status: string; priority: string; dueAt: string; version: number; assignee: { id: string; name: string } };
export type ProjectListItem = { id: string; title: string; status: string; dueAt: string; company: { id: string; displayName: string }; owner: { id: string; name: string }; milestones: { total: number; done: number }; openTasks: number };
export type Project = { id: string; title: string; status: keyof typeof import('@saleshub/shared').projectStatusLabels; startAt: string | null; dueAt: string; completedAt: string | null; version: number; summary: string; company: { id: string; displayName: string }; owner: { id: string; name: string }; milestones: Milestone[]; tasks: ProjectTask[]; canWrite: boolean; canManage: boolean; assignees: Person[];
  commercial?: { opportunity: { id: string; title: string }; contractUrl: string | null; manualWinReason: string | null; quote: { number: string; version: number; title: string; total: string; currency: string } | null } };

export type KnowledgeContent = { summary: string; productVersion?: string | null; technicalSpecs: string; useCases: string; idealCustomer: string; salesPitch: string; limitations: string; discoveryQuestions: string[]; objections: { objection: string; answer: string }[]; faq: { question: string; answer: string }[] };
export type KnowledgeVersion = KnowledgeContent & { id: string; version: number; status: string; lockVersion: number; reviewNote: string | null; publishedAt: string | null; submittedAt: string | null };
export type Attachment = { id: string; name: string; mimeType: string; size: number; createdAt: string };
export type KnowledgeListItem = { id: string; title: string; category: string; tags: string[]; retiredAt: string | null; product: { id: string; name: string; sku: string } | null; published: { version: number; summary: string; publishedAt: string } | null; openVersion?: { id: string; version: number; status: string } | null };
export type KnowledgePage = { items: KnowledgeListItem[]; total: number; categories: string[]; canEdit: boolean };
export type KnowledgeArticle = { id: string; title: string; category: string; tags: string[]; retiredAt: string | null; updatedAt: string; product: { id: string; name: string; sku: string } | null; owner: { id: string; name: string }; attachments: Attachment[]; published: KnowledgeVersion | null; openVersion?: KnowledgeVersion | null; history?: { id: string; version: number; status: string; publishedAt: string | null; createdAt: string; reviewNote: string | null }[]; canEdit: boolean; canPublish: boolean };

export type CourseListItem = { id: string; title: string; description: string; status: string; product: { id: string; name: string } | null; lessonCount: number; completedLessons: number };
export type Lesson = { id: string; position: number; title: string; body: string; passPct: number; article: { id: string; title: string } | null; questions: { id: string; prompt: string; options: string[]; correctIndex?: number }[]; progress: { attempts: number; bestScore: number | null; completedAt: string | null } | null };
export type Course = { id: string; title: string; description: string; status: string; version: number; product: { id: string; name: string } | null; lessons: Lesson[]; canManage: boolean };
export type ProgressReport = { courses: { id: string; title: string; lessonCount: number; learners: { userId: string; name: string; role: string; completed: number; lastCompletedAt: string | null }[] }[] };
export const fileSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
