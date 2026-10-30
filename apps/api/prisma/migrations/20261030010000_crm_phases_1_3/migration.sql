-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'SALES', 'TECHNICAL', 'VIEWER');

-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('NEW_LEAD', 'QUALIFICATION', 'NEEDS_ANALYSIS', 'SOLUTION_DESIGN', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'SALES',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "role" "Role" NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role","resource","action")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "domain" TEXT,
    "sector" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "type" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "ownerId" UUID NOT NULL,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAccess" (
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "CompanyAccess_pkey" PRIMARY KEY ("companyId","userId")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "decisionMaker" BOOLEAN NOT NULL DEFAULT false,
    "preferences" TEXT,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "stage" "Stage" NOT NULL DEFAULT 'NEW_LEAD',
    "estimatedValue" DECIMAL(18,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expectedCloseAt" TIMESTAMPTZ(6),
    "nextActionAt" TIMESTAMPTZ(6) NOT NULL,
    "source" TEXT,
    "competitor" TEXT,
    "products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lostReason" TEXT,
    "wonReason" TEXT,
    "wonAt" TIMESTAMPTZ(6),
    "lostAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageHistory" (
    "id" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "fromStage" "Stage",
    "toStage" "Stage" NOT NULL,
    "changedBy" UUID NOT NULL,
    "note" TEXT,
    "changedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "opportunityId" UUID,
    "contactId" UUID,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "summary" TEXT NOT NULL,
    "outcome" TEXT,
    "happenedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "opportunityId" UUID,
    "assigneeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMPTZ(6) NOT NULL,
    "reminderAt" TIMESTAMPTZ(6),
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "opportunityId" UUID,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "agenda" TEXT,
    "notes" TEXT,
    "outcome" TEXT,
    "location" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAttendee" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "userId" UUID,
    "contactId" UUID,
    "externalEmail" TEXT,

    CONSTRAINT "MeetingAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "taskId" UUID NOT NULL,
    "taskVersion" INTEGER NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "runAt" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Company_ownerId_status_idx" ON "Company"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Company_domain_idx" ON "Company"("domain");

-- CreateIndex
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");

-- CreateIndex
CREATE INDEX "Opportunity_ownerId_stage_expectedCloseAt_idx" ON "Opportunity"("ownerId", "stage", "expectedCloseAt");

-- CreateIndex
CREATE INDEX "Opportunity_companyId_idx" ON "Opportunity"("companyId");

-- CreateIndex
CREATE INDEX "StageHistory_opportunityId_changedAt_idx" ON "StageHistory"("opportunityId", "changedAt");

-- CreateIndex
CREATE INDEX "Activity_companyId_happenedAt_idx" ON "Activity"("companyId", "happenedAt" DESC);

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_dueAt_idx" ON "Task"("assigneeId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_companyId_idx" ON "Task"("companyId");

-- CreateIndex
CREATE INDEX "Meeting_companyId_startsAt_idx" ON "Meeting"("companyId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key" ON "OutboxEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_runAt_idx" ON "OutboxEvent"("status", "runAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAccess" ADD CONSTRAINT "CompanyAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAccess" ADD CONSTRAINT "CompanyAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageHistory" ADD CONSTRAINT "StageHistory_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants supplement API validation.
ALTER TABLE "User" ADD CONSTRAINT "user_email_normalized" CHECK (email = lower(email));
ALTER TABLE "CompanyAccess" ADD CONSTRAINT "access_permission" CHECK (permission IN ('READ', 'WRITE'));
ALTER TABLE "Opportunity" ADD CONSTRAINT "probability_range" CHECK (probability BETWEEN 0 AND 100), ADD CONSTRAINT "value_nonnegative" CHECK ("estimatedValue" >= 0), ADD CONSTRAINT "closed_reason" CHECK ((stage <> 'LOST' OR length(trim("lostReason")) > 0 AND "lostReason" IS NOT NULL) AND (stage <> 'WON' OR length(trim("wonReason")) > 0 AND "wonReason" IS NOT NULL));
ALTER TABLE "Meeting" ADD CONSTRAINT "meeting_time_order" CHECK ("endsAt" > "startsAt");
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "one_identity" CHECK (num_nonnulls("userId", "contactId", "externalEmail") = 1);
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "attendee_user_fk" FOREIGN KEY ("userId") REFERENCES "User"(id);
ALTER TABLE "Task" ADD CONSTRAINT "reminder_before_due" CHECK ("reminderAt" IS NULL OR "reminderAt" <= "dueAt");
ALTER TABLE "Notification" ADD CONSTRAINT "notification_task_fk" FOREIGN KEY ("taskId") REFERENCES "Task"(id);
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "outbox_task_fk" FOREIGN KEY ("taskId") REFERENCES "Task"(id);

INSERT INTO "RolePermission" (role, resource, action)
SELECT role::"Role", resource, action FROM
  (VALUES ('ADMIN'), ('MANAGER'), ('SALES'), ('TECHNICAL'), ('VIEWER')) AS roles(role)
  CROSS JOIN (VALUES ('session','read'), ('session','write'), ('tasks','read')) AS permissions(resource,action);
INSERT INTO "RolePermission" (role, resource, action)
SELECT role::"Role", 'crm', 'read' FROM (VALUES ('ADMIN'), ('MANAGER'), ('SALES'), ('VIEWER')) AS roles(role);
INSERT INTO "RolePermission" (role, resource, action)
SELECT role::"Role", 'crm', 'write' FROM (VALUES ('ADMIN'), ('MANAGER'), ('SALES')) AS roles(role);
INSERT INTO "RolePermission" (role, resource, action)
SELECT role::"Role", 'tasks', 'write' FROM (VALUES ('ADMIN'), ('MANAGER'), ('SALES'), ('TECHNICAL')) AS roles(role);
INSERT INTO "RolePermission" (role, resource, action) VALUES ('ADMIN','users','manage'), ('ADMIN','audit','read');
