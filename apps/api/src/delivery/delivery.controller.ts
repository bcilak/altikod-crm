import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { coursePatchSchema, courseSchema, knowledgeActionSchema, knowledgeCreateSchema, knowledgeEditSchema, knowledgeListSchema, knowledgeMetaPatchSchema, lessonAttemptSchema, lessonPatchSchema, lessonSchema, listSchema, milestonePatchSchema, milestoneSchema, projectPatchSchema, projectTaskSchema } from '@saleshub/shared';
import { Access, type AuthRequest } from '../security/access';
import { ValidatedBody as Input, ZodValidationPipe as V } from '../validation.pipe';
import { type ListQuery } from '../crm/companies.service';
import { ProjectsService } from './projects.service';
import { KnowledgeService } from './knowledge.service';
import { AcademyService } from './academy.service';

type KnowledgeAction = z.infer<typeof knowledgeActionSchema>;
const UUID = new ParseUUIDPipe();

@ApiTags('projects') @Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}
  @Access('projects', 'read') @Get('projects') list(@Req() r: AuthRequest, @Query(new V(listSchema)) q: ListQuery) { return this.projects.list(r.actor, q); }
  @Access('projects', 'read') @Get('projects/:id') get(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.projects.get(r.actor, id); }
  @Access('projects', 'write') @Patch('projects/:id') patch(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(projectPatchSchema) b: z.infer<typeof projectPatchSchema>) { return this.projects.patch(r.actor, id, b); }
  @Access('projects', 'write') @Post('projects/:id/milestones') milestone(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(milestoneSchema) b: z.infer<typeof milestoneSchema>) { return this.projects.addMilestone(r.actor, id, b); }
  @Access('projects', 'write') @Patch('project-milestones/:id') patchMilestone(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(milestonePatchSchema) b: z.infer<typeof milestonePatchSchema>) { return this.projects.patchMilestone(r.actor, id, b); }
  @Access('projects', 'write') @Post('projects/:id/tasks') task(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(projectTaskSchema) b: z.infer<typeof projectTaskSchema>) { return this.projects.addTask(r.actor, id, b); }
}

@ApiTags('knowledge') @Controller()
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}
  @Access('knowledge', 'read') @Get('knowledge') list(@Req() r: AuthRequest, @Query(new V(knowledgeListSchema)) q: z.infer<typeof knowledgeListSchema>) { return this.knowledge.list(r.actor, q); }
  @Access('knowledge', 'read') @Get('knowledge/:id') get(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.knowledge.get(r.actor, id); }
  @Access('knowledge', 'write') @Post('knowledge') create(@Req() r: AuthRequest, @Input(knowledgeCreateSchema) b: z.infer<typeof knowledgeCreateSchema>) { return this.knowledge.create(r.actor, b); }
  @Access('knowledge', 'write') @Patch('knowledge/:id') patch(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(knowledgeMetaPatchSchema) b: z.infer<typeof knowledgeMetaPatchSchema>) { return this.knowledge.patchMeta(r.actor, id, b); }
  @Access('knowledge', 'write') @Post('knowledge/:id/versions') revise(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.knowledge.revise(r.actor, id); }
  @Access('knowledge', 'publish') @Post('knowledge/:id/retire') retire(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.knowledge.retire(r.actor, id, true); }
  @Access('knowledge', 'publish') @Post('knowledge/:id/restore') restore(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.knowledge.retire(r.actor, id, false); }
  @Access('knowledge', 'write') @Get('knowledge-versions/:id') version(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.knowledge.version(r.actor, id); }
  @Access('knowledge', 'write') @Patch('knowledge-versions/:id') edit(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(knowledgeEditSchema) b: z.infer<typeof knowledgeEditSchema>) { return this.knowledge.edit(r.actor, id, b); }
  @Access('knowledge', 'write') @Post('knowledge-versions/:id/submit') submit(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(knowledgeActionSchema) b: KnowledgeAction) { return this.knowledge.action(r.actor, id, 'submit', b); }
  @Access('knowledge', 'publish') @Post('knowledge-versions/:id/publish') publish(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(knowledgeActionSchema) b: KnowledgeAction) { return this.knowledge.action(r.actor, id, 'publish', b); }
  @Access('knowledge', 'publish') @Post('knowledge-versions/:id/reject') reject(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(knowledgeActionSchema) b: KnowledgeAction) { return this.knowledge.action(r.actor, id, 'reject', b); }
  /** Raw upload: Content-Type application/octet-stream, file name in ?name=. Type is detected from content. */
  @ApiConsumes('application/octet-stream')
  @Access('knowledge', 'write') @Post('knowledge/:id/attachments') upload(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Query('name') name: unknown) { return this.knowledge.upload(r.actor, id, name, r.body); }
  @Access('knowledge', 'write') @Post('knowledge-attachments/:id/remove') remove(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.knowledge.removeAttachment(r.actor, id); }
  @Access('knowledge', 'read') @Get('knowledge-attachments/:id') async download(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Res() res: Response) {
    const file = await this.knowledge.download(r.actor, id);
    const ascii = file.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
    res.setHeader('Content-Type', file.mimeType); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.send(file.bytes);
  }
}

@ApiTags('academy') @Controller()
export class AcademyController {
  constructor(private readonly academy: AcademyService) {}
  @Access('academy', 'read') @Get('courses') list(@Req() r: AuthRequest, @Query(new V(listSchema)) q: ListQuery) { return this.academy.list(r.actor, q); }
  @Access('academy', 'manage') @Get('academy/progress') progress() { return this.academy.progress(); }
  @Access('academy', 'read') @Get('courses/:id') get(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.academy.get(r.actor, id); }
  @Access('academy', 'manage') @Post('courses') create(@Req() r: AuthRequest, @Input(courseSchema) b: z.infer<typeof courseSchema>) { return this.academy.create(r.actor, b); }
  @Access('academy', 'manage') @Patch('courses/:id') patch(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(coursePatchSchema) b: z.infer<typeof coursePatchSchema>) { return this.academy.patch(r.actor, id, b); }
  @Access('academy', 'manage') @Post('courses/:id/lessons') lesson(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(lessonSchema) b: z.infer<typeof lessonSchema>) { return this.academy.addLesson(r.actor, id, b); }
  @Access('academy', 'manage') @Patch('lessons/:id') patchLesson(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(lessonPatchSchema) b: z.infer<typeof lessonPatchSchema>) { return this.academy.patchLesson(r.actor, id, b); }
  @Access('academy', 'read') @Post('lessons/:id/attempts') attempt(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(lessonAttemptSchema) b: z.infer<typeof lessonAttemptSchema>) { return this.academy.attempt(r.actor, id, b); }
}
