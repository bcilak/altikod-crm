import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { parseEnv } from './env';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const env = parseEnv(process.env);
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 3000, query_timeout: 3000 }) });
  }
  async onModuleDestroy() { await this.$disconnect(); }
}
