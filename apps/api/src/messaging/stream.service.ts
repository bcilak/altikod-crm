import { HttpException, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Client } from 'pg';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma.service';
import { parseEnv } from '../env';
import { Actor } from '../security/access';
import { conversationScope } from './messaging.service';

type Subscriber = { actor: Actor; res: Response };
export type Signal = { type: 'message'; conversationId: string; seq: number } | { type: 'attachment' | 'update'; conversationId: string } | { type: 'notification'; userId: string; notificationId?: string };
const channel = 'saleshub_messaging';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function parse(payload: string | undefined): Signal | undefined {
  try {
    const value = JSON.parse(payload ?? '') as Record<string, unknown>;
    if ((value.type === 'message' || value.type === 'attachment' || value.type === 'update') && typeof value.conversationId === 'string' && uuid.test(value.conversationId)) return value.type === 'message' ? { type: 'message', conversationId: value.conversationId, seq: Number(value.seq) } : { type: value.type, conversationId: value.conversationId };
    if (value.type === 'notification' && typeof value.userId === 'string' && uuid.test(value.userId)) return { type: 'notification', userId: value.userId, ...(typeof value.notificationId === 'string' && uuid.test(value.notificationId) ? { notificationId: value.notificationId } : {}) };
  } catch { /* ignore malformed signals */ }
  return undefined;
}

/**
 * Server-Sent Events for messaging. PostgreSQL triggers NOTIFY on commit; one LISTEN connection per API process fans
 * signals out. Before anything is written to a browser the subscriber's session is re-validated (revoked, expired or
 * deactivated sessions are disconnected) and conversation access is re-evaluated with the current role and shares.
 * Events carry identifiers only; the browser fetches content through the normal authorised endpoints.
 */
@Injectable()
export class MessagingStream implements OnModuleDestroy {
  private readonly subscribers = new Set<Subscriber>();
  private listener?: Client; private connecting?: Promise<void>; private timer?: ReturnType<typeof setInterval>;
  private readonly handlers: ((signal: Signal) => void)[] = []; private persistent = false; private retry?: ReturnType<typeof setTimeout>;
  heartbeatMs = 25_000;
  readonly perUser = 5; readonly total = 500;
  constructor(private readonly prisma: PrismaService) {}

  async subscribe(actor: Actor, req: Request, res: Response) {
    if (this.subscribers.size >= this.total || [...this.subscribers].filter(s => s.actor.id === actor.id).length >= this.perUser) throw new HttpException('Çok fazla açık canlı bağlantı', 429);
    try { await this.listen(); } catch { throw new ServiceUnavailableException('Canlı güncelleme şu anda kullanılamıyor'); }
    res.status(200);
    // no-transform keeps compressing proxies (e.g. the Next.js dev rewrite) from buffering the stream.
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform'); res.setHeader('X-Accel-Buffering', 'no'); res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const subscriber: Subscriber = { actor, res };
    this.subscribers.add(subscriber);
    req.on('close', () => this.drop(subscriber));
    res.write('retry: 5000\n\n'); this.send(subscriber, 'ready', {});
    this.timer ??= setInterval(() => { void this.beat(); }, this.heartbeatMs);
    this.timer.unref();
  }
  onModuleDestroy() {
    this.persistent = false; if (this.retry) clearTimeout(this.retry);
    for (const s of this.subscribers) this.drop(s);
    void this.listener?.end().catch(() => undefined); this.listener = undefined;
  }

  private send(s: Subscriber, event: string, data: object) { if (!s.res.writableEnded) s.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
  private drop(s: Subscriber) {
    this.subscribers.delete(s);
    if (!s.res.writableEnded) s.res.end();
    if (!this.subscribers.size && this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }
  /** False (and disconnects) when the session behind the stream is no longer valid; refreshes the role otherwise. */
  private async alive(s: Subscriber) {
    const session = await this.prisma.session.findUnique({ where: { id: s.actor.sessionId }, select: { revokedAt: true, expiresAt: true, user: { select: { isActive: true, role: true } } } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) { this.drop(s); return false; }
    s.actor = { ...s.actor, role: session.user.role };
    return true;
  }
  private async beat() {
    for (const s of [...this.subscribers]) {
      try { if (await this.alive(s) && !s.res.writableEnded) s.res.write(': ping\n\n'); } catch { /* database hiccup: try again next beat */ }
    }
  }
  async dispatch(signal: Signal) {
    const targets = [...this.subscribers].filter(s => signal.type !== 'notification' || s.actor.id === signal.userId);
    const access = new Map<string, boolean>();
    for (const s of targets) {
      if (!await this.alive(s)) continue;
      if (signal.type !== 'notification') {
        let visible = access.get(s.actor.id);
        if (visible === undefined) { visible = !!await this.prisma.conversation.findFirst({ where: { AND: [{ id: signal.conversationId }, conversationScope(s.actor)] }, select: { id: true } }); access.set(s.actor.id, visible); }
        if (!visible) continue;
      }
      const { type, ...data } = signal;
      this.send(s, type, type === 'notification' ? {} : data);
    }
  }
  /** One shared LISTEN connection. If it drops, every stream is closed so browsers reconnect and refetch what they missed. */
  /** Server-side consumers (phone push) receive every signal, independent of browser streams. */
  onSignal(handler: (signal: Signal) => void) { this.handlers.push(handler); }
  /** Keeps the LISTEN connection open even with no browser connected, reconnecting every 5 s after a loss. */
  keepListening() {
    this.persistent = true;
    void this.listen().catch(() => this.retryLater());
  }
  private retryLater() {
    if (!this.persistent || this.retry) return;
    this.retry = setTimeout(() => { this.retry = undefined; void this.listen().catch(() => this.retryLater()); }, 5_000);
    this.retry.unref();
  }
  private listen() {
    if (this.listener) return Promise.resolve();
    this.connecting ??= (async () => {
      const client = new Client({ connectionString: parseEnv(process.env).DATABASE_URL });
      const lost = () => {
        if (this.listener !== client) return;
        this.listener = undefined; void client.end().catch(() => undefined);
        for (const s of [...this.subscribers]) this.drop(s);
        this.retryLater();
      };
      client.on('error', lost); client.on('end', lost);
      client.on('notification', message => {
        const signal = message.channel === channel ? parse(message.payload) : undefined; if (!signal) return;
        for (const handler of this.handlers) handler(signal);
        void this.dispatch(signal).catch(() => undefined);
      });
      try { await client.connect(); await client.query(`LISTEN ${channel}`); }
      catch (error) { void client.end().catch(() => undefined); throw error; }
      this.listener = client;
    })().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }
}
