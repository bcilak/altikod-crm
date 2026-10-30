import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { conversationCreateSchema, conversationListSchema, conversationMembersSchema, conversationPatchSchema, conversationReadSchema, directConversationSchema, messageCreateSchema, messageListSchema, recordConversationSchema } from '@saleshub/shared';
import { Access, type AuthRequest } from '../security/access';
import { ValidatedBody as Input, ZodValidationPipe as V } from '../validation.pipe';
import { MessagingService } from './messaging.service';

const UUID = new ParseUUIDPipe();
const userSearchSchema = z.object({ search: z.string().trim().max(100).optional() }).strict();

/** Team messaging (Phase 8). Every route needs messaging.use; channel management is checked per conversation in the service. */
@ApiTags('messaging') @Access('messaging', 'use') @Controller('messaging')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}
  @Get('conversations') list(@Req() r: AuthRequest, @Query(new V(conversationListSchema)) q: z.infer<typeof conversationListSchema>) { return this.messaging.list(r.actor, q); }
  @Post('conversations') create(@Req() r: AuthRequest, @Input(conversationCreateSchema) b: z.infer<typeof conversationCreateSchema>) { return this.messaging.create(r.actor, b); }
  @Post('direct') direct(@Req() r: AuthRequest, @Input(directConversationSchema) b: z.infer<typeof directConversationSchema>) { return this.messaging.direct(r.actor, b.userId); }
  @Post('record-conversations') record(@Req() r: AuthRequest, @Input(recordConversationSchema) b: z.infer<typeof recordConversationSchema>) { return this.messaging.record(r.actor, b.recordType, b.recordId); }
  @Get('users') users(@Req() r: AuthRequest, @Query(new V(userSearchSchema)) q: z.infer<typeof userSearchSchema>) { return this.messaging.users(r.actor, q.search); }
  @Get('conversations/:id') get(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.messaging.get(r.actor, id); }
  @Patch('conversations/:id') patch(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(conversationPatchSchema) b: z.infer<typeof conversationPatchSchema>) { return this.messaging.patch(r.actor, id, b); }
  @Post('conversations/:id/members') add(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(conversationMembersSchema) b: z.infer<typeof conversationMembersSchema>) { return this.messaging.addMembers(r.actor, id, b.userIds); }
  @Post('conversations/:id/members/:userId/remove') remove(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Param('userId', UUID) userId: string) { return this.messaging.removeMember(r.actor, id, userId); }
  @Post('conversations/:id/join') join(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.messaging.join(r.actor, id); }
  @Post('conversations/:id/leave') leave(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.messaging.leave(r.actor, id); }
  @Get('conversations/:id/messages') messages(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Query(new V(messageListSchema)) q: z.infer<typeof messageListSchema>) { return this.messaging.messages(r.actor, id, q); }
  @Post('conversations/:id/messages') send(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(messageCreateSchema) b: z.infer<typeof messageCreateSchema>) { return this.messaging.send(r.actor, id, b); }
  @Post('conversations/:id/read') read(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(conversationReadSchema) b: z.infer<typeof conversationReadSchema>) { return this.messaging.read(r.actor, id, b.seq); }
}
