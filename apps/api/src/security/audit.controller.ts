import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { listSchema } from '@saleshub/shared';
import { Access } from './access';
import { PrismaService } from '../prisma.service';
import { ZodValidationPipe } from '../validation.pipe';
import { type ListQuery, paging } from '../crm/companies.service';
@ApiTags('audit') @Controller('audit-logs') @Access('audit', 'read')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() async list(@Query(new ZodValidationPipe(listSchema)) query: ListQuery) { const [items, total] = await this.prisma.$transaction([this.prisma.auditLog.findMany({ ...paging(query), orderBy: { createdAt: 'desc' } }), this.prisma.auditLog.count()]); return { items, total }; }
}
