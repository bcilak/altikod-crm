import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import webpush from 'web-push';
import { z } from 'zod';
import { messageNotificationLabels, pushSubscriptionSchema } from '@saleshub/shared';
import { PrismaService } from '../prisma.service';
import { parseEnv } from '../env';
import { Actor } from '../security/access';
import { audit, companyScope } from '../security/policy';
import { MessagingService } from '../messaging/messaging.service';
import { MessagingStream } from '../messaging/stream.service';
import { taskScope } from '../crm/work.service';

type Payload = { title: string; body: string; url: string; tag: string; badge: number };
const labels: Record<string, string> = { QUOTE_APPROVAL: 'Teklif onayı bekliyor', QUOTE_EXPIRING: 'Teklif geçerliliği yaklaşıyor', TASK_ASSIGNED: 'Görev atandı', TASK_REMINDER: 'Görev hatırlatması', TASK_OVERDUE: 'Görev hedef tarihi geldi', ...messageNotificationLabels };
/** Push services of Apple, Google/Chromium, Mozilla and Microsoft. The server only ever calls these hosts. */
const pushHosts = [/^web\.push\.apple\.com$/, /\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
const maxDevices = 10;
const maxFailures = 10;
const staleMs = 3600_000;

/** Short device name from the User-Agent, shown in the user's device list. */
export function deviceLabel(ua = '') {
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Cihaz';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Tarayıcı';
  return `${device} · ${browser}`;
}

/**
 * Web Push (VAPID, RFC 8291 payload encryption). A notification row is the single source: whichever API process first
 * claims it (`pushClaimedAt`) sends it, signalled instantly through LISTEN/NOTIFY with a 30 s sweep as safety net.
 * Content follows the recipient's current access; lock-screen text is generic unless that device opted into previews.
 */
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  constructor(private readonly prisma: PrismaService, private readonly messaging: MessagingService, private readonly stream: MessagingStream) {}

  private config() {
    const env = parseEnv(process.env);
    return env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY && env.WEB_PUSH_SUBJECT ? { publicKey: env.WEB_PUSH_PUBLIC_KEY, privateKey: env.WEB_PUSH_PRIVATE_KEY, subject: env.WEB_PUSH_SUBJECT, testOrigin: env.NODE_ENV === 'production' ? undefined : env.WEB_PUSH_TEST_ORIGIN } : undefined;
  }
  onModuleInit() {
    if (!process.env.WEB_PUSH_PUBLIC_KEY) return;
    this.stream.onSignal(signal => { if (signal.type === 'notification' && signal.notificationId) void this.deliver(signal.notificationId).catch(() => console.error('Push delivery failed; the sweep will not retry a claimed notification')); });
    this.stream.keepListening();
    if (process.env.NODE_ENV !== 'test') { this.timer = setInterval(() => { void this.sweep().catch(() => console.error('Push sweep failed')); }, 30_000); this.timer.unref(); }
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  status() { const c = this.config(); return { enabled: !!c, publicKey: c?.publicKey ?? null }; }
  private allowed(endpoint: string) {
    const url = new URL(endpoint); const test = this.config()?.testOrigin;
    if (test && url.origin === new URL(test).origin) return true;
    return url.protocol === 'https:' && !url.port && pushHosts.some(h => h.test(url.hostname));
  }
  async subscribe(actor: Actor, input: z.infer<typeof pushSubscriptionSchema>, userAgent?: string) {
    if (!this.config()) throw new ServiceUnavailableException('Telefon bildirimleri bu sunucuda yapılandırılmadı');
    if (!this.allowed(input.endpoint)) throw new BadRequestException('Desteklenmeyen bildirim servisi');
    const data = { userId: actor.id, sessionId: actor.sessionId, p256dh: input.keys.p256dh, auth: input.keys.auth, label: deviceLabel(userAgent).slice(0, 80), failures: 0 };
    return this.prisma.$transaction(async db => {
      // The same browser endpoint follows whoever is signed in on that device now.
      const existing = await db.pushSubscription.findUnique({ where: { endpoint: input.endpoint } });
      const row = existing
        ? await db.pushSubscription.update({ where: { id: existing.id }, data: { ...data, ...(existing.userId !== actor.id ? { showPreview: false } : {}) } })
        : await db.pushSubscription.create({ data: { ...data, endpoint: input.endpoint } });
      if (!existing || existing.userId !== actor.id) await audit(db, actor.id, 'PUSH_SUBSCRIBE', 'push_subscription', row.id, { label: row.label });
      const extra = await db.pushSubscription.findMany({ where: { userId: actor.id }, orderBy: { updatedAt: 'desc' }, skip: maxDevices, select: { id: true } });
      if (extra.length) await db.pushSubscription.deleteMany({ where: { id: { in: extra.map(e => e.id) } } });
      return this.view(actor, row);
    });
  }
  private view(actor: Actor, s: { id: string; label: string; showPreview: boolean; createdAt: Date; lastSuccessAt: Date | null; sessionId: string | null }) {
    return { id: s.id, label: s.label, showPreview: s.showPreview, createdAt: s.createdAt, lastSuccessAt: s.lastSuccessAt, current: s.sessionId === actor.sessionId };
  }
  async devices(actor: Actor) {
    const rows = await this.prisma.pushSubscription.findMany({ where: { userId: actor.id }, orderBy: { createdAt: 'desc' } });
    return { ...this.status(), devices: rows.map(r => this.view(actor, r)) };
  }
  async preference(actor: Actor, id: string, showPreview: boolean) {
    const row = await this.prisma.pushSubscription.findFirst({ where: { id, userId: actor.id } });
    if (!row) throw new NotFoundException('Cihaz bulunamadı');
    return this.view(actor, await this.prisma.pushSubscription.update({ where: { id }, data: { showPreview } }));
  }
  async remove(actor: Actor, id: string) {
    const { count } = await this.prisma.pushSubscription.deleteMany({ where: { id, userId: actor.id } });
    if (!count) throw new NotFoundException('Cihaz bulunamadı');
    await audit(this.prisma, actor.id, 'PUSH_UNSUBSCRIBE', 'push_subscription', id);
    return { ok: true };
  }
  async test(actor: Actor) {
    const devices = await this.prisma.pushSubscription.findMany({ where: { userId: actor.id } });
    if (!devices.length) throw new NotFoundException('Bildirim açık bir cihazınız yok');
    let sent = 0;
    for (const d of devices) if (await this.send(d, { title: 'Altıkod CRM', body: 'Test bildirimi: bu cihaz bildirim alıyor.', url: '/notifications', tag: 'test', badge: 0 })) sent++;
    return { sent, failed: devices.length - sent };
  }

  /** Claims and sends one notification. A claim is final: push is best-effort, the in-app notification always remains. */
  async deliver(notificationId: string) {
    if (!this.config()) return false;
    const { count } = await this.prisma.notification.updateMany({ where: { id: notificationId, pushClaimedAt: null, createdAt: { gt: new Date(Date.now() - staleMs) } }, data: { pushClaimedAt: new Date() } });
    if (!count) return false;
    const n = await this.prisma.notification.findUniqueOrThrow({ where: { id: notificationId }, include: { user: { select: { id: true, role: true, isActive: true } } } });
    if (!n.user.isActive) return false;
    const devices = await this.prisma.pushSubscription.findMany({ where: { userId: n.userId } });
    if (!devices.length) return false;
    const reader = { ...n.user, name: '', email: '', sessionId: '', csrfToken: '' } as Actor;
    const content = await this.content(reader, n);
    if (!content) return false;
    const badge = await this.prisma.notification.count({ where: { userId: n.userId, readAt: null } });
    for (const d of devices) await this.send(d, { title: d.showPreview ? content.title : 'Altıkod CRM', body: d.showPreview ? content.preview : content.summary, url: content.url, tag: content.tag, badge });
    return true;
  }
  /** What the reader may see right now; null when the target is gone or out of their access. */
  private async content(reader: Actor, n: { id: string; type: string; messageId: string | null; taskId: string | null; quoteVersionId: string | null }) {
    const label = labels[n.type] ?? 'Yeni bildirim';
    if (n.messageId) {
      const target = (await this.messaging.notificationTargets(reader, [n.messageId])).get(n.messageId);
      if (!target) return null;
      const message = await this.prisma.message.findUniqueOrThrow({ where: { id: n.messageId }, select: { body: true, attachments: { where: { removedAt: null }, select: { name: true } } } });
      const text = message.body || message.attachments.map(a => `📎 ${a.name}`).join(', ');
      return { title: target.conversation ? `${target.author} · ${target.conversation}` : target.author, preview: text.length > 140 ? `${text.slice(0, 139)}…` : text, summary: `${label} · ${target.author}`, url: `/messages?c=${target.conversationId}`, tag: `conversation-${target.conversationId}` };
    }
    if (n.taskId) {
      const task = await this.prisma.task.findFirst({ where: { AND: [{ id: n.taskId }, taskScope(reader)] }, select: { id: true, title: true } });
      return task && { title: label, preview: task.title, summary: label, url: `/tasks?task=${task.id}`, tag: `notification-${n.id}` };
    }
    const quote = await this.prisma.quoteVersion.findFirst({ where: { id: n.quoteVersionId!, quote: { company: companyScope(reader) } }, select: { quoteId: true, title: true } });
    return quote && { title: label, preview: quote.title, summary: label, url: `/quotes/${quote.quoteId}`, tag: `notification-${n.id}` };
  }
  /** Encrypts with web-push and posts to the allow-listed push service. Gone subscriptions are removed. */
  private async send(device: { id: string; endpoint: string; p256dh: string; auth: string; failures: number }, payload: Payload) {
    const config = this.config();
    if (!config || !this.allowed(device.endpoint)) { await this.prisma.pushSubscription.deleteMany({ where: { id: device.id } }); return false; }
    const request = webpush.generateRequestDetails({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, JSON.stringify(payload), { vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey }, TTL: 3600, urgency: 'high', contentEncoding: 'aes128gcm', topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) });
    let status = 0;
    try {
      const response = await fetch(request.endpoint, { method: request.method, headers: request.headers as Record<string, string>, body: request.body as Uint8Array, signal: AbortSignal.timeout(10_000), redirect: 'error' });
      status = response.status;
    } catch { /* network error or timeout: status stays 0 */ }
    if (status >= 200 && status < 300) { await this.prisma.pushSubscription.updateMany({ where: { id: device.id }, data: { failures: 0, lastSuccessAt: new Date() } }); return true; }
    if (status === 404 || status === 410 || device.failures + 1 >= maxFailures) await this.prisma.pushSubscription.deleteMany({ where: { id: device.id } });
    else await this.prisma.pushSubscription.updateMany({ where: { id: device.id }, data: { failures: { increment: 1 } } });
    return false;
  }
  /** Safety net for missed signals; notifications older than an hour are closed without a push. */
  async sweep() {
    await this.prisma.notification.updateMany({ where: { pushClaimedAt: null, createdAt: { lte: new Date(Date.now() - staleMs) } }, data: { pushClaimedAt: new Date() } });
    const pending = await this.prisma.notification.findMany({ where: { pushClaimedAt: null }, orderBy: { createdAt: 'asc' }, take: 100, select: { id: true } });
    for (const p of pending) await this.deliver(p.id);
    return pending.length;
  }
}
