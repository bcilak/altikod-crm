import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { taskScope } from './work.service';

@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => { void this.tick().catch(() => console.error('Outbox cycle failed; pending events will retry')); }, 15_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      for (let i = 0; i < 100; i++) if (!await this.processOne()) break;
      await this.prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    } finally { this.running = false; }
  }
  async processOne() {
    let selectedId: string | undefined;
    try {
      return await this.prisma.$transaction(async db => {
        const candidates = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "OutboxEvent" WHERE status = 'PENDING' AND "runAt" <= NOW() ORDER BY "runAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
        selectedId = candidates[0]?.id;
        if (!selectedId) return false;
        const event = await db.outboxEvent.findUniqueOrThrow({ where: { id: selectedId } });
        const task = await db.task.findUnique({ where: { id: event.taskId }, include: { assignee: true } });
        if (task && task.version === event.taskVersion && !['DONE', 'CANCELLED'].includes(task.status) && task.assignee.isActive && await db.task.findFirst({ where: { AND: [{ id: task.id }, taskScope(task.assignee)] } })) {
          await db.notification.upsert({ where: { dedupeKey: event.dedupeKey }, create: { userId: task.assigneeId, taskId: task.id, type: event.type, dedupeKey: event.dedupeKey }, update: {} });
        }
        await db.outboxEvent.update({ where: { id: event.id }, data: { status: 'DONE', completedAt: new Date(), attempts: { increment: 1 } } });
        return true;
      });
    } catch {
      if (selectedId) {
        const event = await this.prisma.outboxEvent.findUnique({ where: { id: selectedId } });
        if (event?.status === 'PENDING') await this.prisma.outboxEvent.updateMany({ where: { id: selectedId, status: 'PENDING' }, data: { attempts: { increment: 1 }, status: event.attempts >= 4 ? 'FAILED' : 'PENDING', runAt: new Date(Date.now() + Math.min(3600_000, 30_000 * 2 ** event.attempts)) } });
      }
      throw new Error('Outbox processing failed');
    }
  }
}
