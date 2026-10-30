import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './security/access';
import { AuthController, UsersController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { createMailer, Mailer } from './auth/mailer';
import { AcademyController, KnowledgeController, ProjectsController } from './delivery/delivery.controller';
import { ProjectsService } from './delivery/projects.service';
import { KnowledgeService } from './delivery/knowledge.service';
import { AcademyService } from './delivery/academy.service';
import { CompaniesController } from './crm/companies.controller';
import { CompaniesService } from './crm/companies.service';
import { OpportunitiesController } from './crm/opportunities.controller';
import { OpportunitiesService } from './crm/opportunities.service';
import { WorkController } from './crm/work.controller';
import { WorkService } from './crm/work.service';
import { OutboxService } from './crm/outbox.service';
import { AuditController } from './security/audit.controller';
import { SalesController } from './sales/sales.controller';
import { CatalogService } from './sales/catalog.service';
import { QuotesService } from './sales/quotes.service';
import { FilesService } from './sales/files.service';
import { OperationsService } from './sales/operations.service';
import { SalesJobs } from './sales/sales-jobs.service';
import { MessagingController } from './messaging/messaging.controller';
import { MessagingService } from './messaging/messaging.service';
import { MessageAttachmentsService } from './messaging/attachments.service';
import { MessagingStream } from './messaging/stream.service';
import { MessageLifecycleService } from './messaging/lifecycle.service';
import { MessageRetentionService } from './messaging/retention.service';
import { PushController } from './push/push.controller';
import { PushService } from './push/push.service';
import { createScanner, MalwareScanner } from './messaging/scanner';

@Module({ controllers: [HealthController, AuthController, UsersController, CompaniesController, OpportunitiesController, WorkController, AuditController, SalesController, ProjectsController, KnowledgeController, AcademyController, MessagingController, PushController], providers: [PrismaService, AuthService, { provide: Mailer, useFactory: () => createMailer() }, CompaniesService, OpportunitiesService, WorkService, OutboxService, CatalogService, QuotesService, FilesService, OperationsService, SalesJobs, ProjectsService, KnowledgeService, AcademyService, MessagingService, MessageAttachmentsService, MessagingStream, MessageLifecycleService, MessageRetentionService, PushService, { provide: MalwareScanner, useFactory: () => createScanner() }, { provide: APP_GUARD, useClass: AccessGuard }] })
export class AppModule {}
