import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { Actor } from './access';
import { isManager } from './access';

export type Db = Prisma.TransactionClient;
export function companyScope(actor: Pick<Actor, 'id' | 'role'>, write = false): Prisma.CompanyWhereInput {
  if (isManager(actor)) return {};
  if (actor.role === 'TECHNICAL' || (write && actor.role === 'VIEWER')) return { id: { in: [] } };
  return { OR: [{ ownerId: actor.id }, { access: { some: { userId: actor.id, ...(write ? { permission: 'WRITE' } : {}) } } }] };
}
export async function requireCompany(db: Db, actor: Actor, id: string, write = false) {
  const company = await db.company.findFirst({ where: { AND: [{ id }, companyScope(actor, write)] } });
  if (!company) throw new NotFoundException('Firma bulunamadı');
  if (write && company.archivedAt) throw new ForbiddenException('Arşivlenmiş firma değiştirilemez');
  return company;
}
export async function validateLinks(db: Db, companyId: string, opportunityId?: string | null, contactId?: string | null) {
  if (opportunityId && !await db.opportunity.findFirst({ where: { id: opportunityId, companyId } })) throw new NotFoundException('Fırsat firma ile eşleşmiyor');
  if (contactId && !await db.contact.findFirst({ where: { id: contactId, companyId, archivedAt: null } })) throw new NotFoundException('Kişi firma ile eşleşmiyor');
}
export async function assignable(db: Db, id: string, companyId: string, technical = false) {
  const user = await db.user.findFirst({ where: { id, isActive: true } });
  if (!user || user.role === 'VIEWER' || (!technical && user.role === 'TECHNICAL')) throw new ForbiddenException('Geçersiz sorumlu');
  if (technical && user.role === 'TECHNICAL') return user;
  if (!await db.company.findFirst({ where: { AND: [{ id: companyId, archivedAt: null }, companyScope(user, true)] } })) throw new ForbiddenException('Sorumlunun firma yazma yetkisi yok');
  return user;
}
export const audit = (db: Db, actorId: string | null, action: string, entity: string, entityId?: string, metadata: Prisma.InputJsonObject = {}) => db.auditLog.create({ data: { actorId, action, entity, entityId, metadata } });
export const can = async (db: Db, actor: Pick<Actor, 'role'>, resource: string, action: string) => !!await db.rolePermission.findUnique({ where: { role_resource_action: { role: actor.role, resource, action } } });
