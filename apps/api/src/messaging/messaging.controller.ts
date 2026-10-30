import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { conversationMuteSchema, messageEditSchema, messageHideSchema, messageKnowledgeSchema, messageSearchSchema, conversationCreateSchema, conversationListSchema, conversationMembersSchema, conversationPatchSchema, conversationReadSchema, directConversationSchema, messageCreateSchema, messageListSchema, recordConversationSchema } from '@saleshub/shared';
import { Access, type AuthRequest } from '../security/access';
import { ValidatedBody as Input, ZodValidationPipe as V } from '../validation.pipe';
import { MessagingService } from './messaging.service';
import { MessageAttachmentsService } from './attachments.service';
import { MessagingStream } from './stream.service';
import { MessageLifecycleService } from './lifecycle.service';

const UUID = new ParseUUIDPipe();
const userSearchSchema = z.object({ search: z.string().trim().max(100).optional() }).strict();

/** Team messaging (Phase 8). Every route needs messaging.use; channel management is checked per conversation in the service. */
@ApiTags('messaging') @Access('messaging', 'use') @Controller('messaging')
export class MessagingController {
  constructor(private readonly messaging: MessagingService, private readonly attachments: MessageAttachmentsService, private readonly live: MessagingStream, private readonly lifecycle: MessageLifecycleService) {}
  /**
   * Server-Sent Events: `message` {conversationId, seq}, `attachment` {conversationId}, `update` {conversationId} (edit, delete,
   * moderation, pin), `notification` {} and `ready`.
   * Events never contain message content; clients refetch through the regular endpoints. Reconnect after `retry`.
   */
  @ApiProduces('text/event-stream') @Get('stream') stream(@Req() r: AuthRequest, @Res() res: Response) { return this.live.subscribe(r.actor, r, res); }
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
  /** Raw upload: Content-Type application/octet-stream, file name in ?name=. Type is detected from content and scanned before storage. */
  @ApiConsumes('application/octet-stream') @ApiBody({ schema: { type: 'string', format: 'binary' }, description: 'File bytes, at most 20 MB' }) @ApiQuery({ name: 'name', required: true, description: 'Original file name; its extension must match the content' })
  @Post('conversations/:id/attachments') upload(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Query('name') name: unknown) { return this.attachments.upload(r.actor, id, name, r.body); }
  @Get('conversations/:id/attachments') files(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.attachments.list(r.actor, id); }
  @Post('attachments/:id/remove') removeDraft(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.attachments.removeDraft(r.actor, id); }
  /** ?inline=1 is honoured only for images (thumbnails); everything else is always a download. */
  @Get('attachments/:id') async download(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Query('inline') inline: unknown, @Res() res: Response) {
    const file = await this.attachments.download(r.actor, id);
    const ascii = file.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
    const disposition = inline === '1' && file.mimeType.startsWith('image/') ? 'inline' : 'attachment';
    res.setHeader('Content-Type', file.mimeType.startsWith('text/') ? `${file.mimeType}; charset=utf-8` : file.mimeType); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.send(file.bytes);
  }
  @Get('search') search(@Req() r: AuthRequest, @Query(new V(messageSearchSchema)) q: z.infer<typeof messageSearchSchema>) { return this.lifecycle.search(r.actor, q.q, q.conversationId); }
  @Get('conversations/:id/pins') pins(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.lifecycle.pins(r.actor, id); }
  @Post('conversations/:id/mute') mute(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(conversationMuteSchema) b: z.infer<typeof conversationMuteSchema>) { return this.lifecycle.mute(r.actor, id, b.until); }
  /** Author only, within 15 minutes; the previous text goes to the edit history. */
  @Patch('messages/:id') edit(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(messageEditSchema) b: z.infer<typeof messageEditSchema>) { return this.lifecycle.edit(r.actor, id, b.body); }
  @Get('messages/:id/revisions') revisions(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.lifecycle.revisions(r.actor, id); }
  @Post('messages/:id/delete') deleteMessage(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.lifecycle.remove(r.actor, id); }
  @Post('messages/:id/hide') hide(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(messageHideSchema) b: z.infer<typeof messageHideSchema>) { return this.lifecycle.hide(r.actor, id, b.reason); }
  @Post('messages/:id/unhide') unhide(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.lifecycle.hide(r.actor, id, null); }
  @Post('messages/:id/pin') pin(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.lifecycle.pin(r.actor, id, true); }
  @Post('messages/:id/unpin') unpin(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.lifecycle.pin(r.actor, id, false); }
  /** Draft knowledge card from a message (requires knowledge.write); goes through the normal review and publish flow. */
  @Post('messages/:id/knowledge') knowledge(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(messageKnowledgeSchema) b: z.infer<typeof messageKnowledgeSchema>) { return this.lifecycle.toKnowledge(r.actor, id, b); }
}
