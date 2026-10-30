import { PrismaService } from './prisma.service';
import { hashPassword } from './auth/auth.service';
import { email, password } from '@saleshub/shared';

async function run() {
  const adminEmail = email.parse(process.env.ADMIN_EMAIL);
  const adminPassword = password.parse(process.env.ADMIN_PASSWORD);
  const db = new PrismaService();
  try {
    if (await db.user.count({ where: { role: 'ADMIN', isActive: true } })) throw new Error('An active administrator already exists; use invitations.');
    await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(832104)`;
      if (await tx.user.count({ where: { role: 'ADMIN', isActive: true } })) throw new Error('Administrator already exists');
      const user = await tx.user.create({ data: { email: adminEmail, name: process.env.ADMIN_NAME ?? 'Yönetici', role: 'ADMIN', passwordHash: await hashPassword(adminPassword) } });
      await tx.auditLog.create({ data: { actorId: user.id, action: 'BOOTSTRAP_ADMIN', entity: 'user', entityId: user.id } });
    });
    console.log('Administrator created. Password was not logged.');
  } finally { await db.$disconnect(); }
}
run().catch(() => { console.error('Admin creation failed. Provide valid ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters); an active admin must not already exist.'); process.exitCode = 1; });
