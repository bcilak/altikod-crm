import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { activitySchema, activityPatchSchema, listSchema, meetingNoteAppendSchema, meetingSchema, meetingPatchSchema, taskSchema, taskPatchSchema } from '@saleshub/shared';
import { Access, type AuthRequest } from '../security/access';
import { ZodValidationPipe as V, ValidatedBody as Input } from '../validation.pipe';
import { type ListQuery } from './companies.service';
import { MessagingService } from '../messaging/messaging.service';
import { WorkService } from './work.service';
@ApiTags('work')
@Controller()
export class WorkController {
  constructor(private readonly service: WorkService, private readonly messaging: MessagingService) {}
  @Access('crm', 'read') @Get('activities') activities(@Req() r: AuthRequest, @Query(new V(listSchema)) q: ListQuery) { return this.service.activities(r.actor, q); }
  @Access('crm', 'read') @Get('activities/:id') activity(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.activity(r.actor, id); }
  @Access('crm', 'write') @Post('activities') createActivity(@Req() r: AuthRequest, @Input(activitySchema) b: z.infer<typeof activitySchema>) { return this.service.createActivity(r.actor, b); }
  @Access('crm', 'write') @Patch('activities/:id') patchActivity(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(activityPatchSchema) b: z.infer<typeof activityPatchSchema>) { return this.service.patchActivity(r.actor, id, b); }
  @Access('tasks', 'read') @Get('tasks') tasks(@Req() r: AuthRequest, @Query(new V(listSchema)) q: ListQuery) { return this.service.tasks(r.actor, q); }
  @Access('tasks', 'read') @Get('tasks/:id') task(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.task(r.actor, id); }
  @Access('crm', 'write') @Post('tasks') createTask(@Req() r: AuthRequest, @Input(taskSchema) b: z.infer<typeof taskSchema>) { return this.service.createTask(r.actor, b); }
  @Access('tasks', 'write') @Patch('tasks/:id') patchTask(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(taskPatchSchema) b: z.infer<typeof taskPatchSchema>) { return this.service.patchTask(r.actor, id, b); }
  @Access('crm', 'read') @Get('meetings') meetings(@Req() r: AuthRequest, @Query(new V(listSchema)) q: ListQuery) { return this.service.meetings(r.actor, q); }
  @ApiOperation({ summary: 'Toplantı okuma görünümü', description: 'Kayıt kapsamı uygulanır. notesCreatedBy/Name/At ve notesUpdatedBy/Name/At sunucunun kaydettiği not yazarlarını ve UTC tarihlerini içerir. Eski notlarda ilk kayıt bilgisi null olabilir. canWrite düzenleme görünümünü belirler; API yetki kontrolü ayrıca uygulanır.' })
  @Access('crm', 'read') @Get('meetings/:id') meeting(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.meeting(r.actor, id); }
  @Access('crm', 'write') @Post('meetings') createMeeting(@Req() r: AuthRequest, @Input(meetingSchema) b: z.infer<typeof meetingSchema>) { return this.service.createMeeting(r.actor, b); }
  @Access('crm', 'write') @Patch('meetings/:id') patchMeeting(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(meetingPatchSchema) b: z.infer<typeof meetingPatchSchema>) { return this.service.patchMeeting(r.actor, id, b); }
  @ApiOperation({ summary: 'Toplantıya madde ekle', description: 'field: notes (görüşülen konular) veya outcome (kararlar). Metnin her dolu satırı "- " ile başlayan ayrı madde olarak mevcut metnin sonuna, satır kilidi altında eklenir; aynı anda not alan kişiler birbirinin maddesini ezmez. Alan 5000 karakteri aşarsa 400. Yazar/tarih bilgileri PATCH ile aynı kuralla güncellenir.' })
  @Access('crm', 'write') @Post('meetings/:id/notes') appendMeetingNote(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(meetingNoteAppendSchema) b: z.infer<typeof meetingNoteAppendSchema>) { return this.service.appendMeetingNote(r.actor, id, b); }
  @Access('session', 'read') @Get('notifications') notifications(@Req() r: AuthRequest) { return this.service.notifications(r.actor, ids => this.messaging.notificationTargets(r.actor, ids)); }
  @ApiOperation({ summary: 'Tüm bildirimleri okundu işaretle', description: 'Yalnız oturumdaki kullanıcının okunmamış bildirimleri; { read: sayı } döner.' })
  @Access('session', 'write') @Post('notifications/read-all') readAll(@Req() r: AuthRequest) { return this.service.readAllNotifications(r.actor); }
  @Access('session', 'write') @Post('notifications/:id/read') read(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.readNotification(r.actor, id, ids => this.messaging.notificationTargets(r.actor, ids)); }
}
