import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { parseEnv } from './env';
import { configureApp } from './http';

async function bootstrap() {
  const env = parseEnv(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '1mb' });
  configureApp(app, env.NODE_ENV !== 'production');
  app.enableShutdownHooks();
  await app.listen(env.PORT, env.HOST);
}
bootstrap().catch(() => { console.error('API startup failed. Check environment and service configuration.'); process.exitCode = 1; });
