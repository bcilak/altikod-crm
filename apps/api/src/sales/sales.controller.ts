import { Controller, Get, Post, Patch, Param, ParseUUIDPipe, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { csvSchema, handoffSchema, listSchema, productSchema, productPatchSchema, quoteActionSchema, quoteCreateSchema, quoteEditSchema, quoteRevisionSchema, reportSchema, settingsSchema } from '@saleshub/shared';
import { Access, type AuthRequest } from '../security/access';
import { ValidatedBody as Input, ZodValidationPipe as V } from '../validation.pipe';
import { type ListQuery } from '../crm/companies.service';
import { CatalogService } from './catalog.service';
import { QuotesService } from './quotes.service';
import { OperationsService } from './operations.service';
type ActionInput = z.infer<typeof quoteActionSchema>;
@ApiTags('sales') @Controller()
export class SalesController {
  constructor(private readonly catalog: CatalogService, private readonly quotes: QuotesService, private readonly operations: OperationsService) {}
  @Access('crm', 'read') @Get('products') products(@Req() r: AuthRequest, @Query(new V(listSchema)) q: ListQuery) { return this.catalog.list(r.actor, q); }
  @Access('crm', 'read') @Get('products/:id') product(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.catalog.get(r.actor, id); }
  @Access('catalog', 'manage') @Post('products') createProduct(@Req() r: AuthRequest, @Input(productSchema) b: z.infer<typeof productSchema>) { return this.catalog.save(r.actor, b); }
  @Access('catalog', 'manage') @Patch('products/:id') patchProduct(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(productPatchSchema) b: z.infer<typeof productPatchSchema>) { return this.catalog.save(r.actor, b, id); }
  @Access('settings', 'manage') @Get('settings/sales') settings() { return this.catalog.settings(); }
  @Access('settings', 'manage') @Patch('settings/sales') updateSettings(@Req() r: AuthRequest, @Input(settingsSchema) b: z.infer<typeof settingsSchema>) { return this.catalog.updateSettings(r.actor, b); }
  @Access('crm', 'read') @Get('quotes') list(@Req() r: AuthRequest, @Query(new V(listSchema)) q: ListQuery) { return this.quotes.list(r.actor, q); }
  @Access('crm', 'read') @Get('quotes/:id') get(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.quotes.get(r.actor, id); }
  @Access('crm', 'write') @Post('quotes') create(@Req() r: AuthRequest, @Input(quoteCreateSchema) b: z.infer<typeof quoteCreateSchema>) { return this.quotes.create(r.actor, b); }
  @Access('crm', 'write') @Patch('quote-versions/:id') edit(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(quoteEditSchema) b: z.infer<typeof quoteEditSchema>) { return this.quotes.edit(r.actor, id, b); }
  @Access('crm', 'write') @Post('quotes/:id/versions') revise(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(quoteRevisionSchema) b: z.infer<typeof quoteRevisionSchema>) { return this.quotes.revise(r.actor, id, b); }
  @Access('crm', 'write') @Post('quote-versions/:id/request-approval') request(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(quoteActionSchema) b: ActionInput) { return this.quotes.action(r.actor, id, 'request-approval', b); }
  @Access('quotes', 'approve') @Post('quote-versions/:id/approve') approve(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(quoteActionSchema) b: ActionInput) { return this.quotes.action(r.actor, id, 'approve', b); }
  @Access('crm', 'write') @Post('quote-versions/:id/send') send(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(quoteActionSchema) b: ActionInput) { return this.quotes.action(r.actor, id, 'send', b); }
  @Access('crm', 'write') @Post('quote-versions/:id/accept') accept(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(quoteActionSchema) b: ActionInput) { return this.quotes.action(r.actor, id, 'accept', b); }
  @Access('crm', 'write') @Post('quote-versions/:id/reject') reject(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(quoteActionSchema) b: ActionInput) { return this.quotes.action(r.actor, id, 'reject', b); }
  @Access('crm', 'write') @Post('quote-versions/:id/withdraw') withdraw(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(quoteActionSchema) b: ActionInput) { return this.quotes.action(r.actor, id, 'withdraw', b); }
  @Access('crm', 'read') @Get('quote-versions/:id/pdf') async pdf(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) { const file = await this.quotes.pdf(r.actor, id); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`); res.send(file.bytes); }
  @Access('reports', 'read') @Get('reports/overview') overview(@Req() r: AuthRequest, @Query(new V(reportSchema)) q: z.infer<typeof reportSchema>) { return this.operations.overview(r.actor, q); }
  @Access('exports', 'read') @Get('exports/companies') async exportCompanies(@Req() r: AuthRequest, @Query(new V(reportSchema)) q: z.infer<typeof reportSchema>, @Res() res: Response) { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="companies.csv"'); res.send(await this.operations.export(r.actor, 'companies', q)); }
  @Access('exports', 'read') @Get('exports/opportunities') async exportOpportunities(@Req() r: AuthRequest, @Query(new V(reportSchema)) q: z.infer<typeof reportSchema>, @Res() res: Response) { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="opportunities.csv"'); res.send(await this.operations.export(r.actor, 'opportunities', q)); }
  @Access('crm', 'write') @Post('imports/companies/preview') preview(@Req() r: AuthRequest, @Input(csvSchema) b: z.infer<typeof csvSchema>) { return this.operations.preview(r.actor, b.csv); }
  @Access('crm', 'write') @Post('imports/companies/:id/confirm') confirm(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.operations.confirm(r.actor, id); }
  @Access('crm', 'read') @Get('handoffs') handoffs(@Req() r: AuthRequest, @Query(new V(listSchema)) q: ListQuery) { return this.operations.handoffs(r.actor, q); }
  @Access('crm', 'write') @Post('handoffs/from-opportunity/:id') handoff(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(handoffSchema) b: z.infer<typeof handoffSchema>) { return this.operations.handoff(r.actor, id, b); }
}
