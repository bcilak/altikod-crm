import { Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { pushPreferenceSchema, pushSubscriptionSchema } from '@saleshub/shared';
import { Access, type AuthRequest } from '../security/access';
import { ValidatedBody as Input } from '../validation.pipe';
import { PushService } from './push.service';

const UUID = new ParseUUIDPipe();

/** Phone/desktop notifications (Web Push). Devices are personal: every route acts on the caller's own subscriptions. */
@ApiTags('push') @Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}
  @Access('session', 'read') @Get('devices') devices(@Req() r: AuthRequest) { return this.push.devices(r.actor); }
  @Access('session', 'write') @Post('subscriptions') subscribe(@Req() r: AuthRequest, @Input(pushSubscriptionSchema) b: z.infer<typeof pushSubscriptionSchema>, @Headers('user-agent') ua?: string) { return this.push.subscribe(r.actor, b, ua); }
  @Access('session', 'write') @Patch('devices/:id') preference(@Req() r: AuthRequest, @Param('id', UUID) id: string, @Input(pushPreferenceSchema) b: z.infer<typeof pushPreferenceSchema>) { return this.push.preference(r.actor, id, b.showPreview); }
  @Access('session', 'write') @Post('devices/:id/remove') remove(@Req() r: AuthRequest, @Param('id', UUID) id: string) { return this.push.remove(r.actor, id); }
  @Access('session', 'write') @Post('test') test(@Req() r: AuthRequest) { return this.push.test(r.actor); }
}
