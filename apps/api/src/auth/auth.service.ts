import { BadRequestException, ForbiddenException, ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma.service';
import { Actor, digest } from '../security/access';
import { audit } from '../security/policy';
import { Mailer } from './mailer';
import { SESSION_IDLE_MS } from './session-policy';
import { parseEnv } from '../env';
import { Role } from '../generated/prisma/client';

export const hashPassword = (value: string) => argon2.hash(value, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
const publicUser = { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, mustChangePassword: true } as const;

@Injectable()
export class AuthService {
  private readonly dummyHash = hashPassword(randomBytes(32).toString('hex'));
  constructor(private readonly prisma: PrismaService, private readonly mail: Mailer) {}
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = await argon2.verify(user?.passwordHash ?? await this.dummyHash, password);
    if (!user || !user.isActive || !user.passwordHash || !valid) {
      await audit(this.prisma, null, 'LOGIN_FAILED', 'auth');
      throw new UnauthorizedException('E-posta veya parola hatalı');
    }
    const token = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    await this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
      const current = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      if (!current.isActive || current.passwordHash !== user.passwordHash) throw new UnauthorizedException('Hesap değişti; tekrar giriş yapın');
      await db.session.create({ data: { userId: user.id, tokenHash: digest(token), csrfToken, expiresAt: new Date(Date.now() + SESSION_IDLE_MS) } });
      await audit(db, user.id, 'LOGIN', 'auth');
    });
    return { token, csrfToken, user: { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword } };
  }
  async logout(actor: Actor) {
    await this.prisma.$transaction(async db => {
      await db.session.update({ where: { id: actor.sessionId }, data: { revokedAt: new Date() } });
      // Signing out of a device also stops its phone notifications.
      await db.pushSubscription.deleteMany({ where: { sessionId: actor.sessionId } });
      await audit(db, actor.id, 'LOGOUT', 'auth');
    });
    return { ok: true };
  }
  async createUser(actor: Actor, input: { email: string; name: string; role: Role; temporaryPassword: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Yalnız yönetici kullanıcı oluşturabilir');
    const passwordHash = await hashPassword(input.temporaryPassword);
    try {
      return await this.prisma.$transaction(async db => {
        const user = await db.user.create({ data: { email: input.email, name: input.name, role: input.role, passwordHash, mustChangePassword: true }, select: publicUser });
        await audit(db, actor.id, 'USER_CREATE', 'user', user.id, { role: user.role });
        return user;
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Bu e-posta zaten kayıtlı');
      throw error;
    }
  }
  async resetPassword(actor: Actor, id: string, temporaryPassword: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Yalnız yönetici parola sıfırlayabilir');
    if (actor.id === id) throw new BadRequestException('Kendi parolanız için parola değiştirme ekranını kullanın');
    const passwordHash = await hashPassword(temporaryPassword);
    await this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT id FROM "User" WHERE id = ${id}::uuid FOR UPDATE`;
      const user = await db.user.findUnique({ where: { id } });
      if (!user) throw new BadRequestException('Kullanıcı bulunamadı');
      if (!user.isActive) throw new BadRequestException('Önce hesabı etkinleştirin');
      if (user.passwordHash && await argon2.verify(user.passwordHash, temporaryPassword)) throw new BadRequestException('Farklı bir geçici parola belirleyin');
      await db.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
      await db.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await db.authToken.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: new Date() } });
      await db.pushSubscription.deleteMany({ where: { userId: id } });
      await audit(db, actor.id, 'ADMIN_PASSWORD_RESET', 'user', id);
    });
    return { ok: true };
  }
  async changePassword(actor: Actor, input: { currentPassword: string; password: string }) {
    if (input.currentPassword === input.password) throw new BadRequestException('Yeni parola mevcut paroladan farklı olmalı');
    const passwordHash = await hashPassword(input.password);
    await this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT id FROM "User" WHERE id = ${actor.id}::uuid FOR UPDATE`;
      const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
      const session = await db.session.findUnique({ where: { id: actor.sessionId } });
      if (!user.isActive || !session || session.revokedAt || session.expiresAt <= new Date()) throw new UnauthorizedException('Oturum sona erdi');
      if (!user.passwordHash || !await argon2.verify(user.passwordHash, input.currentPassword)) throw new BadRequestException('Mevcut parola hatalı');
      await db.user.update({ where: { id: actor.id }, data: { passwordHash, mustChangePassword: false } });
      await db.session.updateMany({ where: { userId: actor.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await db.authToken.updateMany({ where: { userId: actor.id, usedAt: null }, data: { usedAt: new Date() } });
      await db.pushSubscription.deleteMany({ where: { userId: actor.id } });
      await audit(db, actor.id, 'PASSWORD_CHANGE', 'user', actor.id);
    });
    return { ok: true };
  }
  async invite(actor: Actor, input: { email: string; name: string; role: Role }) {
    this.requireMail();
    const raw = randomBytes(32).toString('hex');
    const user = await this.prisma.$transaction(async db => {
      const existing = await db.user.findUnique({ where: { email: input.email } });
      if (existing?.passwordHash) throw new ConflictException('Kullanıcı zaten kayıtlı');
      const user = await db.user.upsert({ where: { email: input.email }, create: input, update: { ...input, isActive: true } });
      await db.authToken.updateMany({ where: { userId: user.id, kind: 'INVITE', usedAt: null }, data: { usedAt: new Date() } });
      await db.authToken.create({ data: { userId: user.id, tokenHash: digest(raw), kind: 'INVITE', expiresAt: new Date(Date.now() + 48 * 3600_000) } });
      await audit(db, actor.id, 'INVITE', 'user', user.id, { role: input.role });
      return { id: user.id, email: user.email };
    });
    try { await this.mail.send(input.email, 'INVITE', `${parseEnv(process.env).APP_ORIGIN}/accept-invite#token=${raw}`); }
    catch { throw new ServiceUnavailableException('Davet e-postası gönderilemedi. Daveti yeniden gönderin; önceki bağlantı geçersiz olur.'); }
    return { ...user, delivery: this.mail.delivery };
  }
  async requestReset(email: string) {
    this.requireMail();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user?.isActive && user.passwordHash) {
      const raw = randomBytes(32).toString('hex');
      await this.prisma.$transaction(async db => {
        await db.authToken.updateMany({ where: { userId: user.id, kind: 'RESET', usedAt: null }, data: { usedAt: new Date() } });
        await db.authToken.create({ data: { userId: user.id, tokenHash: digest(raw), kind: 'RESET', expiresAt: new Date(Date.now() + 30 * 60_000) } });
        await audit(db, user.id, 'RESET_REQUEST', 'auth');
      });
      // Same response whether or not delivery fails, so the endpoint cannot reveal which accounts exist.
      try { await this.mail.send(email, 'RESET', `${parseEnv(process.env).APP_ORIGIN}/reset-password#token=${raw}`); }
      catch { console.error(JSON.stringify({ event: 'mail_delivery_failed', kind: 'RESET' })); }
    }
    return { message: 'Hesap uygunsa parola sıfırlama bağlantısı hazırlanmıştır.' };
  }
  private requireMail() {
    if (this.mail.delivery === 'DISABLED') throw new ServiceUnavailableException('E-posta gönderimi şu anda kapalı. Yöneticiyle iletişime geçin.');
  }
  async consume(raw: string, password: string, kind: string) {
    const hash = await hashPassword(password);
    await this.prisma.$transaction(async db => {
      const token = await db.authToken.findUnique({ where: { tokenHash: digest(raw) }, include: { user: true } });
      if (!token || token.kind !== kind || token.usedAt || token.expiresAt <= new Date() || !token.user.isActive) throw new BadRequestException('Bağlantı geçersiz veya süresi dolmuş');
      await db.$queryRaw`SELECT id FROM "User" WHERE id = ${token.userId}::uuid FOR UPDATE`;
      const claim = await db.authToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
      if (claim.count !== 1) throw new ConflictException('Bağlantı zaten kullanılmış');
      await db.user.update({ where: { id: token.userId }, data: { passwordHash: hash, mustChangePassword: false } });
      await db.session.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await db.pushSubscription.deleteMany({ where: { userId: token.userId } });
      await db.authToken.updateMany({ where: { userId: token.userId, usedAt: null }, data: { usedAt: new Date() } });
      await audit(db, token.userId, `${kind}_COMPLETE`, 'auth');
    });
    return { ok: true };
  }
  users() { return this.prisma.user.findMany({ select: publicUser, orderBy: { name: 'asc' } }); }
  async updateUser(actor: Actor, id: string, input: { name?: string; role?: Role; isActive?: boolean }) {
    if (actor.id === id && (input.role && input.role !== 'ADMIN' || input.isActive === false)) throw new BadRequestException('Kendi yönetici erişiminizi kaldıramazsınız');
    return this.prisma.$transaction(async db => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(832104)`;
      const previous = await db.user.findUniqueOrThrow({ where: { id } });
      if (previous.role === 'ADMIN' && previous.isActive && (input.isActive === false || input.role && input.role !== 'ADMIN') && await db.user.count({ where: { role: 'ADMIN', isActive: true } }) <= 1) throw new BadRequestException('Son aktif yönetici kaldırılamaz');
      const user = await db.user.update({ where: { id }, data: input, select: publicUser });
      if (input.isActive === false) { await db.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }); await db.pushSubscription.deleteMany({ where: { userId: id } }); }
      await audit(db, actor.id, 'USER_UPDATE', 'user', id, { role: user.role, isActive: user.isActive });
      return user;
    });
  }
}
