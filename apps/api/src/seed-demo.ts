import { randomBytes } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { hashPassword } from './auth/auth.service';

async function run() {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') throw new Error('Explicit local demo opt-in required');
  const db = new PrismaService();
  try {
    const user = await db.user.upsert({ where: { email: 'demo-sales@example.invalid' }, create: { email: 'demo-sales@example.invalid', name: 'DEMO Satış', role: 'SALES', passwordHash: await hashPassword(randomBytes(32).toString('hex')) }, update: {} });
    if (!await db.company.findFirst({ where: { displayName: 'DEMO Teknoloji', ownerId: user.id } })) await db.company.create({ data: { displayName: 'DEMO Teknoloji', legalName: 'DEMO Teknoloji (Gerçek firma değildir)', ownerId: user.id, tags: ['DEMO'] } });
    console.log('DEMO-only records ready. No usable demo password was generated; use admin invitations/reset to grant access.');
  } finally { await db.$disconnect(); }
}
run().catch(() => { console.error('Demo seed refused or failed'); process.exitCode = 1; });
