import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { companyScope } from '../security/policy';
@Injectable()
export class SalesJobs implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>; private running = false;
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() { if (process.env.NODE_ENV !== 'test') { this.timer = setInterval(() => { void this.tick().catch(() => console.error('Sales reminder cycle failed')); }, 60_000); this.timer.unref(); } }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async tick() {
    if (this.running) return; this.running = true;
    try {
      const candidates = await this.prisma.quoteVersion.findMany({ where: { status: { in: ['APPROVED', 'SENT', 'PENDING_APPROVAL'] }, validUntil: { lte: new Date(Date.now() + 86400_000) } }, take: 100, orderBy: { validUntil: 'asc' }, select: { id: true, quoteId: true } });
      for (const item of candidates) await this.prisma.$transaction(async db => {
        await db.$queryRaw`SELECT id FROM "Quote" WHERE id = ${item.quoteId}::uuid FOR UPDATE`;
        const row = await db.quoteVersion.findUniqueOrThrow({ where: { id: item.id }, include: { quote: true } });
        if (!['APPROVED', 'SENT', 'PENDING_APPROVAL'].includes(row.status)) return;
        if (row.validUntil <= new Date()) {
          await db.quoteVersion.update({ where: { id: row.id }, data: { status: 'EXPIRED', lockVersion: { increment: 1 } } });
          await db.quoteEvent.create({ data: { quoteVersionId: row.id, fromStatus: row.status, toStatus: 'EXPIRED' } });
        } else {
          const user = await db.user.findFirst({ where: { id: row.quote.createdBy, isActive: true } });
          if (user && await db.company.findFirst({ where: { AND: [{ id: row.quote.companyId, archivedAt: null }, companyScope(user)] } })) await db.notification.upsert({ where: { dedupeKey: `quote-expiry:${row.id}:${user.id}` }, create: { userId: user.id, quoteVersionId: row.id, type: 'QUOTE_EXPIRING', dedupeKey: `quote-expiry:${row.id}:${user.id}` }, update: {} });
        }
      });
    } finally { this.running = false; }
  }
}
