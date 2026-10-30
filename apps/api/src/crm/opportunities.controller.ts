import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { listSchema, opportunitySchema, opportunityPatchSchema, transitionSchema } from '@saleshub/shared';
import { Access, type AuthRequest } from '../security/access';
import { ZodValidationPipe as V, ValidatedBody as Input } from '../validation.pipe';
import { type ListQuery } from './companies.service';
import { OpportunitiesService } from './opportunities.service';
@ApiTags('opportunities')
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly service: OpportunitiesService) {}
  @Access('crm', 'read') @Get() list(@Req() r: AuthRequest, @Query(new V(listSchema)) q: ListQuery) { return this.service.list(r.actor, q); }
  @Access('crm', 'read') @Get(':id') get(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.get(r.actor, id); }
  @Access('crm', 'write') @Post() create(@Req() r: AuthRequest, @Input(opportunitySchema) b: z.infer<typeof opportunitySchema>) { return this.service.create(r.actor, b); }
  @Access('crm', 'write') @Patch(':id') update(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(opportunityPatchSchema) b: z.infer<typeof opportunityPatchSchema>) { return this.service.update(r.actor, id, b); }
  @Access('crm', 'write') @Post(':id/stage-transitions') transition(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(transitionSchema) b: z.infer<typeof transitionSchema>) { return this.service.transition(r.actor, id, b); }
}
