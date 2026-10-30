import { ArgumentsHost, Catch, ExceptionFilter, HttpException, INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { raw, type Request, type Response, type NextFunction } from 'express';
import { Prisma } from './generated/prisma/client';

@Catch()
class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const prismaCode = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
    const status = error instanceof HttpException ? error.getStatus() : prismaCode === 'P2025' ? 404 : ['P2002', 'P2034', 'P2003'].includes(prismaCode ?? '') ? 409 : 500;
    response.status(status).json({ error: {
      code: ({ 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 429: 'RATE_LIMITED', 503: 'SERVICE_UNAVAILABLE' } as Record<number, string>)[status] ?? 'INTERNAL_ERROR',
      // Deliberate 503s carry user-facing text; unexpected 500s and database errors never expose details.
      message: error instanceof HttpException && status !== 500 ? error.message : status >= 500 ? 'Service temporarily unavailable' : 'Request failed',
      requestId: response.getHeader('X-Request-Id'),
    } });
  }
}

export function configureApp(app: INestApplication, exposeDocs = true) {
  app.setGlobalPrefix('api/v1');
  // Knowledge attachments arrive as raw bytes; the service enforces the 5 MB limit with a clear message.
  app.use(/^\/api\/v1\/knowledge\/[^/]+\/attachments$/, raw({ type: 'application/octet-stream', limit: '6mb' }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-Id', randomUUID());
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.NODE_ENV === 'production') {
      const start = performance.now();
      res.on('finish', () => console.log(JSON.stringify({ event: 'http_request', requestId: res.getHeader('X-Request-Id'), method: req.method, route: req.route?.path ?? 'unmatched', status: res.statusCode, durationMs: Math.round(performance.now() - start) })));
    }
    next();
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  if (exposeDocs) {
    const config = new DocumentBuilder().setTitle('Altıkod CRM API').setVersion('0.5.0').addCookieAuth('saleshub_session').setDescription('Phases 1–6 and 8 (messaging core): sessions, CRM, catalog, immutable quotes/PDF, reports, CSV, handoffs, delivery, knowledge, academy and team messaging. Mutation requests require matching Origin and session X-CSRF-Token. Money is represented as decimal strings. Customer send/accept actions are manual records.').build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }
}
