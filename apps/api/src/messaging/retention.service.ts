import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { parseEnv } from '../env';
import { audit } from '../security/policy';
import { FilesService } from '../sales/files.service';
import { removeIfUnreferenced } from './attachments.service';

/**
 * Retention (F8-01 default: two years, MESSAGE_RETENTION_DAYS). Channel, group and direct messages older than the cut-off
 * lose their text, edit history and files; the message keeps its place as “removed” with ids and timestamps only.
 * Record conversations are kept as long as the record itself (records are archived, never deleted).
 */
@Injectable()
export class MessageRetentionService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>; private running = false;
  constructor(private readonly prisma: PrismaService, private readonly files: FilesService) {}
  onModuleInit() { if (process.env.NODE_ENV !== 'test') { this.timer = setInterval(() => { void this.purge().catch(() => console.error('Message retention run failed; it will retry')); }, 6 * 3600_000); this.timer.unref(); } }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async purge(now = new Date()) {
    if (this.running) return { messages: 0, files: 0 };
    this.running = true;
    try {
      const cutoff = new Date(now.getTime() - parseEnv(process.env).MESSAGE_RETENTION_DAYS * 86_400_000);
      let messages = 0; const keys = new Set<string>();
      for (;;) {
        const batch = (await this.prisma.message.findMany({ where: { createdAt: { lt: cutoff }, expiredAt: null, conversation: { kind: { in: ['CHANNEL', 'GROUP', 'DIRECT'] } } }, select: { id: true }, take: 200 })).map(m => m.id);
        if (!batch.length) break;
        await this.prisma.$transaction(async db => {
          await db.message.updateMany({ where: { id: { in: batch }, expiredAt: null }, data: { body: '', expiredAt: now, hiddenReason: null, pinnedAt: null, pinnedById: null } });
          await db.messageRevision.deleteMany({ where: { messageId: { in: batch } } });
          const files = await db.messageAttachment.findMany({ where: { messageId: { in: batch }, removedAt: null }, select: { id: true, fileKey: true } });
          await db.messageAttachment.updateMany({ where: { id: { in: files.map(f => f.id) } }, data: { removedAt: now } });
          for (const f of files) keys.add(f.fileKey);
        });
        messages += batch.length;
      }
      for (const key of keys) await removeIfUnreferenced(this.prisma, this.files, key);
      if (messages) await audit(this.prisma, null, 'MESSAGE_RETENTION', 'message', undefined, { messages, files: keys.size, cutoff: cutoff.toISOString() });
      return { messages, files: keys.size };
    } finally { this.running = false; }
  }
}
