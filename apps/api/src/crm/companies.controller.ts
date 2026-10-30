import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { companySchema, companyPatchSchema, contactSchema, contactPatchSchema, listSchema, uuid } from '@saleshub/shared';
import { Access, type AuthRequest } from '../security/access';
import { ZodValidationPipe as V, ValidatedBody as Input } from '../validation.pipe';
import { CompaniesService, type ListQuery } from './companies.service';
const shareSchema = z.object({ userId: uuid, permission: z.enum(['READ', 'WRITE', 'NONE']) }).strict();
@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly service: CompaniesService) {}
  @Access('crm', 'read') @Get() list(@Req() r: AuthRequest, @Query(new V(listSchema)) q: ListQuery) { return this.service.list(r.actor, q); }
  @Access('crm', 'read') @Get('directory') directory() { return this.service.directory(); }
  @Access('crm', 'write') @Post() create(@Req() r: AuthRequest, @Input(companySchema) b: z.infer<typeof companySchema>) { return this.service.create(r.actor, b); }
  @Access('crm', 'read') @Get(':id') get(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.get(r.actor, id); }
  @Access('crm', 'write') @Patch(':id') update(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(companyPatchSchema) b: z.infer<typeof companyPatchSchema>) { return this.service.update(r.actor, id, b); }
  @Access('crm', 'write') @Post(':id/archive') archive(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body(new V(z.object({ archived: z.boolean() }).strict())) b: { archived: boolean }) { return this.service.archive(r.actor, id, b.archived); }
  @Access('crm', 'read') @Get(':id/shares') shares(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.shares(r.actor, id); }
  @Access('crm', 'write') @Post(':id/shares') share(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(shareSchema) b: z.infer<typeof shareSchema>) { return this.service.share(r.actor, id, b.userId, b.permission); }
  @Access('crm', 'read') @Get(':id/contacts') async contacts(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return (await this.service.get(r.actor, id)).contacts; }
  @Access('crm', 'write') @Post(':id/contacts') contact(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(contactSchema) b: z.infer<typeof contactSchema>) { return this.service.createContact(r.actor, id, b); }
  @Access('crm', 'write') @Patch(':id/contacts/:contactId') patchContact(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Param('contactId', ParseUUIDPipe) contactId: string, @Input(contactPatchSchema) b: z.infer<typeof contactPatchSchema>) { return this.service.updateContact(r.actor, id, contactId, b); }
  @Access('crm', 'read') @Get(':id/timeline') timeline(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Query(new V(listSchema)) q: ListQuery) { return this.service.timeline(r.actor, id, q); }
}
