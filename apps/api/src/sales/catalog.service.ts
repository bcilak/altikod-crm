import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { productSchema, productPatchSchema, settingsSchema } from '@saleshub/shared';
import { PrismaService } from '../prisma.service';
import { Actor, isManager } from '../security/access';
import { audit, Db } from '../security/policy';
import { ListQuery, paging } from '../crm/companies.service';
export const financeAccess = async (db: Db, actor: Actor) => !!await db.rolePermission.findUnique({ where: { role_resource_action: { role: actor.role, resource: 'finance', action: 'read' } } });
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}
  async list(actor: Actor, q: ListQuery) {
    const where = { ...(!isManager(actor) ? { status: 'APPROVED' } : q.status ? { status: q.status } : {}), ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' as const } }, { sku: { contains: q.search, mode: 'insensitive' as const } }] } : {}) };
    const [rows, total] = await this.prisma.$transaction([this.prisma.product.findMany({ where, ...paging(q), orderBy: { name: 'asc' } }), this.prisma.product.count({ where })]);
    const finance = await financeAccess(this.prisma, actor);
    return { items: rows.map(p => ({ ...p, cost: finance ? p.cost : undefined })), total };
  }
  async get(actor: Actor, id: string) {
    const row = await this.prisma.product.findFirst({ where: { id, ...(!isManager(actor) ? { status: 'APPROVED' } : {}) } });
    if (!row) throw new NotFoundException();
    return { ...row, cost: await financeAccess(this.prisma, actor) ? row.cost : undefined };
  }
  async save(actor: Actor, input: z.infer<typeof productSchema> | z.infer<typeof productPatchSchema>, id?: string) {
    if (input.cost !== undefined && !await financeAccess(this.prisma, actor)) throw new ForbiddenException('Maliyet izni gerekli');
    return this.prisma.$transaction(async db => {
      const row = id ? await db.product.update({ where: { id }, data: input }) : await db.product.create({ data: input as z.infer<typeof productSchema> });
      await audit(db, actor.id, id ? 'UPDATE' : 'CREATE', 'product', row.id, { fields: Object.keys(input) });
      return { ...row, cost: await financeAccess(db, actor) ? row.cost : undefined };
    });
  }
  async settings() { return this.prisma.salesSettings.upsert({ where: { id: 'default' }, create: {}, update: {} }); }
  async updateSettings(actor: Actor, input: z.infer<typeof settingsSchema>) {
    await this.settings();
    return this.prisma.$transaction(async db => {
      const { revision, ...data } = input;
      const row = await db.salesSettings.updateMany({ where: { id: 'default', revision }, data: { ...data, revision: { increment: 1 } } });
      if (row.count !== 1) throw new ConflictException('Ayarlar değişti; yenileyin');
      await audit(db, actor.id, 'SETTINGS_UPDATE', 'sales_settings', 'default', { fields: Object.keys(data) });
      return db.salesSettings.findUniqueOrThrow({ where: { id: 'default' } });
    });
  }
}
