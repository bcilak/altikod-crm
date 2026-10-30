-- Phase 8 (F8-02): team messaging core — channels, private groups, direct messages, record conversations.
-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('CHANNEL', 'GROUP', 'DIRECT', 'RECORD');

-- CreateEnum
CREATE TYPE "ConversationMemberRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "kind" "ConversationKind" NOT NULL,
    "name" TEXT,
    "topic" TEXT NOT NULL DEFAULT '',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "postingRestricted" BOOLEAN NOT NULL DEFAULT false,
    "directKey" TEXT,
    "companyId" UUID,
    "opportunityId" UUID,
    "projectId" UUID,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMPTZ(6),
    "createdById" UUID,
    "archivedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMember" (
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "ConversationMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMPTZ(6),

    CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "ConversationReadState" (
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadSeq" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ConversationReadState_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "authorId" UUID NOT NULL,
    "parentId" UUID,
    "body" TEXT NOT NULL,
    "clientNonce" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_directKey_key" ON "Conversation"("directKey");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_companyId_key" ON "Conversation"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_opportunityId_key" ON "Conversation"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_projectId_key" ON "Conversation"("projectId");

-- CreateIndex
CREATE INDEX "Conversation_kind_lastMessageAt_idx" ON "Conversation"("kind", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ConversationMember_userId_leftAt_idx" ON "ConversationMember"("userId", "leftAt");

-- CreateIndex
CREATE INDEX "ConversationReadState_userId_idx" ON "ConversationReadState"("userId");

-- CreateIndex
CREATE INDEX "Message_conversationId_parentId_seq_idx" ON "Message"("conversationId", "parentId", "seq");

-- CreateIndex
CREATE INDEX "Message_parentId_seq_idx" ON "Message"("parentId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_seq_key" ON "Message"("conversationId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Message_authorId_clientNonce_key" ON "Message"("authorId", "clientNonce");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationReadState" ADD CONSTRAINT "ConversationReadState_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationReadState" ADD CONSTRAINT "ConversationReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Shape of each conversation kind: a record conversation links exactly one record, a direct one has its pair key, named kinds have a name.
ALTER TABLE "Conversation" ADD CONSTRAINT "conversation_shape" CHECK (
  num_nonnulls("companyId", "opportunityId", "projectId") = CASE WHEN "kind" = 'RECORD' THEN 1 ELSE 0 END
  AND ("kind" = 'DIRECT') = ("directKey" IS NOT NULL)
  AND ("kind" IN ('CHANNEL', 'GROUP')) = ("name" IS NOT NULL)
  AND ("isPublic" = false OR "kind" = 'CHANNEL')
  AND ("postingRestricted" = false OR "kind" = 'CHANNEL')
  AND "lastSeq" >= 0
);
ALTER TABLE "ConversationReadState" ADD CONSTRAINT "read_seq_non_negative" CHECK ("lastReadSeq" >= 0);
ALTER TABLE "Message" ADD CONSTRAINT "message_body_length" CHECK (char_length("body") BETWEEN 1 AND 4000 AND "seq" > 0);
-- Channel names are unique regardless of case, archived channels included, so links and mentions stay unambiguous.
CREATE UNIQUE INDEX "conversation_channel_name" ON "Conversation"(lower("name")) WHERE "kind" = 'CHANNEL';

-- Replies stay in their parent's conversation and threads are one level deep.
-- Message content is append-only until editing/deletion with revision history is delivered (F8-06).
CREATE OR REPLACE FUNCTION protect_message() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Messages are append-only'; END IF;
  IF NEW."parentId" IS NOT NULL THEN
    SELECT "conversationId", "parentId" INTO parent FROM "Message" WHERE id = NEW."parentId";
    IF parent."conversationId" IS DISTINCT FROM NEW."conversationId" OR parent."parentId" IS NOT NULL THEN RAISE EXCEPTION 'Invalid reply parent'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER message_append_only BEFORE INSERT OR UPDATE OR DELETE ON "Message" FOR EACH ROW EXECUTE FUNCTION protect_message();

INSERT INTO "RolePermission" (role, resource, action)
SELECT role::"Role", 'messaging', 'use' FROM (VALUES ('ADMIN'),('MANAGER'),('SALES'),('TECHNICAL'),('VIEWER')) r(role);
INSERT INTO "RolePermission" (role, resource, action)
SELECT role::"Role", 'messaging', 'channels.manage' FROM (VALUES ('ADMIN'),('MANAGER')) r(role);

-- Starting channels (product owner default). Public; #duyurular accepts posts from managers only.
INSERT INTO "Conversation" (id, kind, name, topic, "isPublic", "postingRestricted", "updatedAt") VALUES
  (gen_random_uuid(), 'CHANNEL', 'genel', 'Ekip geneli iş yazışması', true, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CHANNEL', 'satış', 'Satış ekibi', true, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CHANNEL', 'teknik', 'Teknik ekip ve teslimat', true, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CHANNEL', 'duyurular', 'Yönetim duyuruları', true, true, CURRENT_TIMESTAMP);
