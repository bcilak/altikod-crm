-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "projectId" UUID;

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "handoffId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNED',
    "startAt" TIMESTAMPTZ(6),
    "dueAt" TIMESTAMPTZ(6) NOT NULL,
    "completedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMilestone" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMPTZ(6) NOT NULL,
    "completedAt" TIMESTAMPTZ(6),
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productId" UUID,
    "ownerId" UUID NOT NULL,
    "publishedVersionId" UUID,
    "retiredAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeVersion" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
    "lockVersion" INTEGER NOT NULL DEFAULT 1,
    "summary" TEXT NOT NULL,
    "productVersion" TEXT,
    "technicalSpecs" TEXT NOT NULL DEFAULT '',
    "useCases" TEXT NOT NULL DEFAULT '',
    "idealCustomer" TEXT NOT NULL DEFAULT '',
    "salesPitch" TEXT NOT NULL DEFAULT '',
    "discoveryQuestions" JSONB NOT NULL DEFAULT '[]',
    "objections" JSONB NOT NULL DEFAULT '[]',
    "faq" JSONB NOT NULL DEFAULT '[]',
    "limitations" TEXT NOT NULL DEFAULT '',
    "authorId" UUID NOT NULL,
    "reviewerId" UUID,
    "reviewNote" TEXT,
    "submittedAt" TIMESTAMPTZ(6),
    "publishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "KnowledgeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeAttachment" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "fileKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMPTZ(6),

    CONSTRAINT "KnowledgeAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "productId" UUID,
    "ownerId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "articleId" UUID,
    "passPct" INTEGER NOT NULL DEFAULT 80,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" TEXT[],
    "correctIndex" INTEGER NOT NULL,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "bestScore" INTEGER,
    "completedAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_opportunityId_key" ON "Project"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_handoffId_key" ON "Project"("handoffId");

-- CreateIndex
CREATE INDEX "Project_ownerId_status_idx" ON "Project"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Project_companyId_idx" ON "Project"("companyId");

-- CreateIndex
CREATE INDEX "ProjectMilestone_projectId_position_idx" ON "ProjectMilestone"("projectId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticle_publishedVersionId_key" ON "KnowledgeArticle"("publishedVersionId");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_category_idx" ON "KnowledgeArticle"("category");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_productId_idx" ON "KnowledgeArticle"("productId");

-- CreateIndex
CREATE INDEX "KnowledgeVersion_status_idx" ON "KnowledgeVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeVersion_articleId_version_key" ON "KnowledgeVersion"("articleId", "version");

-- CreateIndex
CREATE INDEX "KnowledgeAttachment_articleId_idx" ON "KnowledgeAttachment"("articleId");

-- CreateIndex
CREATE INDEX "Course_status_idx" ON "Course"("status");

-- CreateIndex
CREATE INDEX "Lesson_courseId_position_idx" ON "Lesson"("courseId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_userId_lessonId_key" ON "LessonProgress"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_handoffId_fkey" FOREIGN KEY ("handoffId") REFERENCES "Handoff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeVersion" ADD CONSTRAINT "KnowledgeVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeAttachment" ADD CONSTRAINT "KnowledgeAttachment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing handoffs become delivery projects; their handoff task becomes the first project task.
INSERT INTO "Project" ("id", "opportunityId", "companyId", "handoffId", "ownerId", "title", "dueAt", "createdBy", "createdAt", "updatedAt")
SELECT gen_random_uuid(), h."opportunityId", h."companyId", h."id", h."ownerId", o."title", t."dueAt", h."createdBy", h."createdAt", NOW()
FROM "Handoff" h JOIN "Opportunity" o ON o."id" = h."opportunityId" JOIN "Task" t ON t."id" = h."taskId";
UPDATE "Task" t SET "projectId" = p."id" FROM "Project" p JOIN "Handoff" h ON h."id" = p."handoffId" WHERE t."id" = h."taskId";

ALTER TABLE "Project" ADD CONSTRAINT "project_completion" CHECK (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL));
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "milestone_position" CHECK ("position" >= 0);
ALTER TABLE "KnowledgeAttachment" ADD CONSTRAINT "attachment_size" CHECK ("size" > 0 AND "size" <= 5242880);
ALTER TABLE "KnowledgeAttachment" ADD CONSTRAINT "attachment_type" CHECK ("mimeType" IN ('application/pdf', 'image/png', 'image/jpeg'));
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "knowledge_published_fk" FOREIGN KEY ("publishedVersionId") REFERENCES "KnowledgeVersion"("id") ON DELETE RESTRICT;
ALTER TABLE "Lesson" ADD CONSTRAINT "lesson_pass_pct" CHECK ("passPct" BETWEEN 0 AND 100);
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "quiz_options" CHECK (cardinality("options") BETWEEN 2 AND 6 AND "correctIndex" >= 0 AND "correctIndex" < cardinality("options"));
ALTER TABLE "LessonProgress" ADD CONSTRAINT "progress_score" CHECK ("bestScore" IS NULL OR "bestScore" BETWEEN 0 AND 100);

-- At most one editable (draft or in-review) version per article.
CREATE UNIQUE INDEX "knowledge_one_open_version" ON "KnowledgeVersion"("articleId") WHERE "status" IN ('DRAFT', 'IN_REVIEW');

-- Submitted content is frozen; published history is append-only.
CREATE OR REPLACE FUNCTION protect_knowledge_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE workflow text[] := ARRAY['status','lockVersion','reviewerId','reviewNote','submittedAt','publishedAt','updatedAt'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'Reviewed knowledge version cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'PUBLISHED' AND NEW.status NOT IN ('PUBLISHED', 'SUPERSEDED') THEN RAISE EXCEPTION 'Published knowledge cannot return to editing'; END IF;
  IF OLD.status = 'SUPERSEDED' AND NEW.status <> 'SUPERSEDED' THEN RAISE EXCEPTION 'Superseded knowledge is final'; END IF;
  IF OLD.status <> 'DRAFT' AND (to_jsonb(NEW) - workflow) IS DISTINCT FROM (to_jsonb(OLD) - workflow) THEN RAISE EXCEPTION 'Submitted knowledge content is immutable'; END IF;
  IF OLD.status IN ('PUBLISHED', 'SUPERSEDED') AND (NEW."reviewerId" IS DISTINCT FROM OLD."reviewerId" OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt" OR NEW."reviewNote" IS DISTINCT FROM OLD."reviewNote") THEN RAISE EXCEPTION 'Publication record is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER knowledge_version_immutable BEFORE UPDATE OR DELETE ON "KnowledgeVersion" FOR EACH ROW EXECUTE FUNCTION protect_knowledge_version();

INSERT INTO "RolePermission" (role, resource, action)
SELECT role::"Role", resource, action FROM (VALUES ('ADMIN'),('MANAGER'),('SALES'),('TECHNICAL'),('VIEWER')) r(role)
CROSS JOIN (VALUES ('projects','read'),('knowledge','read'),('academy','read')) p(resource,action);
INSERT INTO "RolePermission" (role, resource, action) SELECT role::"Role", 'projects', 'write' FROM (VALUES ('ADMIN'),('MANAGER'),('SALES'),('TECHNICAL')) r(role);
INSERT INTO "RolePermission" (role, resource, action) SELECT role::"Role", 'knowledge', 'write' FROM (VALUES ('ADMIN'),('MANAGER'),('TECHNICAL')) r(role);
INSERT INTO "RolePermission" (role, resource, action)
SELECT role::"Role", resource, action FROM (VALUES ('ADMIN'),('MANAGER')) r(role)
CROSS JOIN (VALUES ('knowledge','publish'),('academy','manage')) p(resource,action);
