import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { Response } from 'express';
import { SESSION_IDLE_MS, SESSION_MAX_MS, SESSION_REFRESH_MS, sessionCookie } from '../auth/session-policy';
import { PrismaService } from '../prisma.service';
import { parseEnv } from '../env';
import type { Role } from '../generated/prisma/client';

export type Actor = { id: string; role: Role; name: string; email: string; sessionId: string; csrfToken: string; mustChangePassword?: boolean };
export const PasswordChangeAllowed = () => SetMetadata('passwordChangeAllowed', true);
export type AuthRequest = Request & { actor: Actor };
export const Public = () => SetMetadata('public', true);
export const Access = (resource: string, action: string) => SetMetadata('access', { resource, action });
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const isManager = (actor: Pick<Actor, 'role'>) => ['ADMIN', 'MANAGER'].includes(actor.role);
export function safeEqual(a: string, b: string) { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>('public', [context.getHandler(), context.getClass()]);
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (mutation) {
      const origin = req.headers.origin;
      if (origin !== parseEnv(process.env).APP_ORIGIN) throw new ForbiddenException('Geçersiz istek kaynağı');
    }
    if (isPublic && !mutation) return true;
    const bucket = Math.floor(Date.now() / (15 * 60_000));
    const key = digest(`${req.ip}|${isPublic ? req.path : 'api'}|${bucket}`);
    const limit = await this.prisma.rateLimit.upsert({ where: { key }, create: { key, expiresAt: new Date((bucket + 1) * 15 * 60_000) }, update: { count: { increment: 1 } } });
    if (limit.count > (isPublic ? 20 : 1500)) throw new HttpException('Çok fazla istek; lütfen daha sonra deneyin', 429);
    if (isPublic) return true;
    const token = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('saleshub_session='))?.slice('saleshub_session='.length);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException('Oturum gerekli');
    const session = await this.prisma.session.findUnique({ where: { tokenHash: digest(token) }, include: { user: true } });
    const now = Date.now();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now || session.createdAt.getTime() + SESSION_MAX_MS <= now || !session.user.isActive) throw new UnauthorizedException('Oturum sona erdi');
    req.actor = { id: session.user.id, role: session.user.role, name: session.user.name, email: session.user.email, sessionId: session.id, csrfToken: session.csrfToken, mustChangePassword: session.user.mustChangePassword };
    if (session.user.mustChangePassword && !this.reflector.get<boolean>('passwordChangeAllowed', context.getHandler())) throw new ForbiddenException('Devam etmek için parolanızı değiştirin');
    if (mutation && !safeEqual(String(req.headers['x-csrf-token'] ?? ''), session.csrfToken)) throw new ForbiddenException('Geçersiz CSRF doğrulaması');
    const permission = this.reflector.getAllAndOverride<{ resource: string; action: string }>('access', [context.getHandler(), context.getClass()]);
    if (!permission || !await this.prisma.rolePermission.findUnique({ where: { role_resource_action: { role: req.actor.role, ...permission } } })) {
      await this.prisma.auditLog.create({ data: { actorId: req.actor.id, action: 'ACCESS_DENIED', entity: 'permission' } });
      throw new ForbiddenException('Bu işlem için yetkiniz yok');
    }
    const expiresAt = new Date(Math.min(now + SESSION_IDLE_MS, session.createdAt.getTime() + SESSION_MAX_MS));
    if (expiresAt.getTime() - session.expiresAt.getTime() >= SESSION_REFRESH_MS) {
      const refreshed = await this.prisma.session.updateMany({ where: { id: session.id, revokedAt: null, expiresAt: { gt: new Date(now), lt: expiresAt }, user: { isActive: true } }, data: { expiresAt } });
      if (refreshed.count) context.switchToHttp().getResponse<Response>().cookie('saleshub_session', token, sessionCookie(expiresAt.getTime() - now));
    }
    return true;
  }
}
