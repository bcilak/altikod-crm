import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { activitySchema, activityPatchSchema, listSchema, meetingSchema, meetingPatchSchema, taskSchema, taskPatchSchema } from '@saleshub/shared';
import { Access, type AuthRequest } from '../security/access';
import { ZodValidationPipe as V, ValidatedBody as Input } from '../validation.pipe';
import { type ListQuery } from './companies.service';
import { WorkService } from './work.service';
@ApiTags('work')
@Controller()
export class WorkController {
  constructor(private readonly service: WorkService) {}
  @Access('crm', 'read') @Get('activities') activities(@Req() r: AuthRequest, @Query(new V(listSchema)) q: ListQuery) { return this.service.activities(r.actor, q); }
  @Access('crm', 'read') @Get('activities/:id') activity(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.activity(r.actor, id); }
  @Access('crm', 'write') @Post('activities') createActivity(@Req() r: AuthRequest, @Input(activitySchema) b: z.infer<typeof activitySchema>) { return this.service.createActivity(r.actor, b); }
  @Access('crm', 'write') @Patch('activities/:id') patchActivity(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(activityPatchSchema) b: z.infer<typeof activityPatchSchema>) { return this.service.patchActivity(r.actor, id, b); }
  @Access('tasks', 'read') @Get('tasks') tasks(@Req() r: AuthRequest, @Query(new V(listSchema)) q: ListQuery) { return this.service.tasks(r.actor, q); }
  @Access('tasks', 'read') @Get('tasks/:id') task(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.task(r.actor, id); }
  @Access('crm', 'write') @Post('tasks') createTask(@Req() r: AuthRequest, @Input(taskSchema) b: z.infer<typeof taskSchema>) { return this.service.createTask(r.actor, b); }
  @Access('tasks', 'write') @Patch('tasks/:id') patchTask(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(taskPatchSchema) b: z.infer<typeof taskPatchSchema>) { return this.service.patchTask(r.actor, id, b); }
  @Access('crm', 'read') @Get('meetings') meetings(@Req() r: AuthRequest, @Query(new V(listSchema)) q: ListQuery) { return this.service.meetings(r.actor, q); }
  @Access('crm', 'write') @Post('meetings') createMeeting(@Req() r: AuthRequest, @Input(meetingSchema) b: z.infer<typeof meetingSchema>) { return this.service.createMeeting(r.actor, b); }
  @Access('crm', 'write') @Patch('meetings/:id') patchMeeting(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(meetingPatchSchema) b: z.infer<typeof meetingPatchSchema>) { return this.service.patchMeeting(r.actor, id, b); }
  @Access('session', 'read') @Get('notifications') notifications(@Req() r: AuthRequest) { return this.service.notifications(r.actor); }
  @Access('session', 'write') @Post('notifications/:id/read') read(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.readNotification(r.actor, id); }
}
