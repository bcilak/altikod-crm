import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { coursePatchSchema, courseSchema, lessonAttemptSchema, lessonPatchSchema, lessonSchema } from '@saleshub/shared';
import { PrismaService } from '../prisma.service';
import { CourseStatus, Prisma } from '../generated/prisma/client';
import { Actor } from '../security/access';
import { audit, can, Db } from '../security/policy';
import { ListQuery, paging } from '../crm/companies.service';

type Question = z.infer<typeof lessonSchema>['questions'][number];
const questionRows = (questions: Question[]) => questions.map((q, position) => ({ position, prompt: q.prompt, options: q.options, correctIndex: q.correctIndex }));

@Injectable()
export class AcademyService {
  constructor(private readonly prisma: PrismaService) {}
  private manager(db: Db, actor: Actor) { return can(db, actor, 'academy', 'manage'); }

  async list(actor: Actor, q: ListQuery) {
    const manager = await this.manager(this.prisma, actor);
    if (q.status && !Object.values(CourseStatus).includes(q.status as CourseStatus)) throw new BadRequestException('Geçersiz eğitim durumu');
    const where: Prisma.CourseWhereInput = { ...(manager ? (q.status ? { status: q.status as CourseStatus } : {}) : { status: 'PUBLISHED' }), ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({ where, ...paging(q), orderBy: { title: 'asc' }, include: { product: { select: { id: true, name: true } }, lessons: { select: { id: true, progress: { where: { userId: actor.id }, select: { completedAt: true } } } } } }),
      this.prisma.course.count({ where }),
    ]);
    return { items: rows.map(({ lessons, ...c }) => ({ ...c, lessonCount: lessons.length, completedLessons: lessons.filter(l => l.progress[0]?.completedAt).length })), total, canManage: manager };
  }
  async get(actor: Actor, id: string) {
    const manager = await this.manager(this.prisma, actor);
    const course = await this.prisma.course.findFirst({ where: { id, ...(manager ? {} : { status: 'PUBLISHED' }) }, include: {
      product: { select: { id: true, name: true } },
      lessons: { orderBy: { position: 'asc' }, include: {
        article: { select: { id: true, title: true, publishedVersionId: true, retiredAt: true } },
        // The answer key is selected only for course managers; learners never receive correctIndex.
        questions: { orderBy: { position: 'asc' }, select: { id: true, position: true, prompt: true, options: true, correctIndex: manager } },
        progress: { where: { userId: actor.id }, select: { attempts: true, bestScore: true, completedAt: true } },
      } },
    } });
    if (!course) throw new NotFoundException('Eğitim bulunamadı');
    return { ...course, canManage: manager, lessons: course.lessons.map(({ article, progress, ...l }) => ({ ...l, article: article && (manager || (article.publishedVersionId && !article.retiredAt)) ? { id: article.id, title: article.title } : null, progress: progress[0] ?? null })) };
  }
  async create(actor: Actor, input: z.infer<typeof courseSchema>) {
    return this.prisma.$transaction(async db => {
      if (input.productId && !await db.product.findUnique({ where: { id: input.productId }, select: { id: true } })) throw new NotFoundException('Ürün bulunamadı');
      const row = await db.course.create({ data: { ...input, ownerId: actor.id } });
      await audit(db, actor.id, 'CREATE', 'course', row.id);
      return row;
    });
  }
  private async lockedCourse(db: Db, id: string) {
    await db.$queryRaw`SELECT id FROM "Course" WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await db.course.findUnique({ where: { id }, include: { _count: { select: { lessons: true } } } });
    if (!row) throw new NotFoundException('Eğitim bulunamadı');
    return row;
  }
  async patch(actor: Actor, id: string, input: z.infer<typeof coursePatchSchema>) {
    return this.prisma.$transaction(async db => {
      const course = await this.lockedCourse(db, id);
      const { version: expected, ...data } = input;
      if (course.version !== expected) throw new ConflictException('Eğitim başka biri tarafından değiştirildi; sayfayı yenileyin');
      if (data.status === 'PUBLISHED' && !course._count.lessons) throw new ConflictException('Yayınlamak için en az bir ders gerekli');
      if (data.productId && !await db.product.findUnique({ where: { id: data.productId }, select: { id: true } })) throw new NotFoundException('Ürün bulunamadı');
      const row = await db.course.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
      await audit(db, actor.id, data.status && data.status !== course.status ? 'COURSE_STATUS' : 'UPDATE', 'course', id, { fields: Object.keys(data), ...(data.status ? { from: course.status, to: data.status } : {}) });
      return row;
    });
  }
  private async article(db: Db, articleId?: string | null) {
    if (articleId && !await db.knowledgeArticle.findUnique({ where: { id: articleId }, select: { id: true } })) throw new NotFoundException('Bilgi kartı bulunamadı');
  }
  async addLesson(actor: Actor, courseId: string, input: z.infer<typeof lessonSchema>) {
    return this.prisma.$transaction(async db => {
      const course = await this.lockedCourse(db, courseId);
      if (course.status !== 'DRAFT') throw new ConflictException('Ders eklemek için eğitimi taslağa alın');
      await this.article(db, input.articleId);
      const last = await db.lesson.aggregate({ where: { courseId }, _max: { position: true } });
      const { questions, ...lesson } = input;
      const row = await db.lesson.create({ data: { ...lesson, courseId, position: (last._max.position ?? -1) + 1, questions: { create: questionRows(questions) } } });
      await audit(db, actor.id, 'CREATE', 'lesson', row.id, { courseId, questions: questions.length });
      return row;
    });
  }
  async patchLesson(actor: Actor, id: string, input: z.infer<typeof lessonPatchSchema>) {
    return this.prisma.$transaction(async db => {
      const lesson = await db.lesson.findUnique({ where: { id }, select: { courseId: true } });
      if (!lesson) throw new NotFoundException('Ders bulunamadı');
      const course = await this.lockedCourse(db, lesson.courseId);
      if (course.status !== 'DRAFT') throw new ConflictException('Dersi düzenlemek için eğitimi taslağa alın');
      await this.article(db, input.articleId);
      const { questions, ...data } = input;
      if (questions) await db.quizQuestion.deleteMany({ where: { lessonId: id } });
      const row = await db.lesson.update({ where: { id }, data: { ...data, ...(questions ? { questions: { create: questionRows(questions) } } : {}) } });
      await audit(db, actor.id, 'UPDATE', 'lesson', id, { fields: Object.keys(input) });
      return row;
    });
  }
  /** Server-side grading. The response carries only the score, never which answers were right. */
  async attempt(actor: Actor, lessonId: string, input: z.infer<typeof lessonAttemptSchema>) {
    return this.prisma.$transaction(async db => {
      const lesson = await db.lesson.findFirst({ where: { id: lessonId, course: { status: 'PUBLISHED' } }, include: { questions: { orderBy: { position: 'asc' }, select: { correctIndex: true } } } });
      if (!lesson) throw new NotFoundException('Ders bulunamadı');
      if (input.answers.length !== lesson.questions.length) throw new BadRequestException(`${lesson.questions.length} sorunun tamamı yanıtlanmalı`);
      const correct = lesson.questions.filter((q, i) => q.correctIndex === input.answers[i]).length;
      const score = lesson.questions.length ? Math.floor(correct * 100 / lesson.questions.length) : 100;
      const passed = score >= lesson.passPct;
      await db.$executeRaw`INSERT INTO "LessonProgress" (id, "userId", "lessonId", "updatedAt") VALUES (gen_random_uuid(), ${actor.id}::uuid, ${lessonId}::uuid, NOW()) ON CONFLICT ("userId", "lessonId") DO NOTHING`;
      const current = (await db.$queryRaw<{ id: string; bestScore: number | null; completedAt: Date | null }[]>`SELECT id, "bestScore", "completedAt" FROM "LessonProgress" WHERE "userId" = ${actor.id}::uuid AND "lessonId" = ${lessonId}::uuid FOR UPDATE`)[0]!;
      const row = await db.lessonProgress.update({ where: { id: current.id }, data: { attempts: { increment: 1 }, bestScore: Math.max(current.bestScore ?? 0, score), completedAt: current.completedAt ?? (passed ? new Date() : null) } });
      await audit(db, actor.id, 'LESSON_ATTEMPT', 'lesson', lessonId, { score, passed });
      return { score, passed, passPct: lesson.passPct, attempts: row.attempts, completed: !!row.completedAt };
    });
  }
  async progress() {
    const [courses, users, done] = await this.prisma.$transaction([
      this.prisma.course.findMany({ where: { status: 'PUBLISHED' }, orderBy: { title: 'asc' }, select: { id: true, title: true, _count: { select: { lessons: true } } } }),
      this.prisma.user.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, role: true } }),
      this.prisma.lessonProgress.findMany({ where: { completedAt: { not: null }, lesson: { course: { status: 'PUBLISHED' } } }, select: { userId: true, completedAt: true, lesson: { select: { courseId: true } } } }),
    ]);
    return { courses: courses.map(c => ({ id: c.id, title: c.title, lessonCount: c._count.lessons, learners: users.map(u => {
      const mine = done.filter(d => d.userId === u.id && d.lesson.courseId === c.id);
      return { userId: u.id, name: u.name, role: u.role, completed: mine.length, lastCompletedAt: mine.reduce<Date | null>((latest, d) => !latest || d.completedAt! > latest ? d.completedAt : latest, null) };
    }) })) };
  }
}
