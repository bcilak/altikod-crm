-- Phase 8 (F8-06): edit history, deletion, moderation, pins, mute, search and retention.
-- AlterTable
ALTER TABLE "ConversationReadState" ADD COLUMN     "mutedUntil" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "deletedAt" TIMESTAMPTZ(6),
ADD COLUMN     "deletedById" UUID,
ADD COLUMN     "editedAt" TIMESTAMPTZ(6),
ADD COLUMN     "expiredAt" TIMESTAMPTZ(6),
ADD COLUMN     "hiddenAt" TIMESTAMPTZ(6),
ADD COLUMN     "hiddenById" UUID,
ADD COLUMN     "hiddenReason" TEXT,
ADD COLUMN     "pinnedAt" TIMESTAMPTZ(6),
ADD COLUMN     "pinnedById" UUID;

-- AlterTable
ALTER TABLE "MessageAttachment" ADD COLUMN     "removedAt" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "MessageRevision" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MessageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageRevision_messageId_createdAt_idx" ON "MessageRevision"("messageId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_pinnedAt_idx" ON "Message"("conversationId", "pinnedAt");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- AddForeignKey
ALTER TABLE "MessageRevision" ADD CONSTRAINT "MessageRevision_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "message_lifecycle_shape" CHECK (
  ("deletedAt" IS NULL) = ("deletedById" IS NULL)
  AND ("pinnedAt" IS NULL) = ("pinnedById" IS NULL)
  AND ("hiddenAt" IS NOT NULL OR ("hiddenReason" IS NULL AND "hiddenById" IS NULL))
  AND ("expiredAt" IS NULL OR "body" = '')
);

-- Turkish full-text search over message text (expression index; queries use the same expression).
CREATE INDEX "message_search" ON "Message" USING GIN (to_tsvector('turkish', "body"));

-- Messages: identity is immutable; deletion and retention are one-way; text changes only through an edit by the
-- 15-minute window (the previous text is archived here, so history cannot be skipped) or the retention purge.
-- The trigger keeps its F8-02 name, message_append_only, because operational checks refer to it.
CREATE OR REPLACE FUNCTION protect_message() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Messages cannot be deleted; use soft deletion'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."parentId" IS NOT NULL THEN
      SELECT "conversationId", "parentId" INTO parent FROM "Message" WHERE id = NEW."parentId";
      IF parent."conversationId" IS DISTINCT FROM NEW."conversationId" OR parent."parentId" IS NOT NULL THEN RAISE EXCEPTION 'Invalid reply parent'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW."conversationId", NEW.seq, NEW."authorId", NEW."parentId", NEW."clientNonce", NEW."createdAt")
     IS DISTINCT FROM (OLD.id, OLD."conversationId", OLD.seq, OLD."authorId", OLD."parentId", OLD."clientNonce", OLD."createdAt") THEN
    RAISE EXCEPTION 'Message identity is immutable';
  END IF;
  IF OLD."deletedAt" IS NOT NULL AND (NEW."deletedAt", NEW."deletedById") IS DISTINCT FROM (OLD."deletedAt", OLD."deletedById") THEN RAISE EXCEPTION 'Message deletion is final'; END IF;
  IF OLD."expiredAt" IS NOT NULL AND NEW."expiredAt" IS DISTINCT FROM OLD."expiredAt" THEN RAISE EXCEPTION 'Message expiry is final'; END IF;
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    IF OLD."expiredAt" IS NULL AND NEW."expiredAt" IS NOT NULL AND NEW.body = '' THEN
      NULL; -- retention purge
    ELSIF OLD."deletedAt" IS NULL AND OLD."hiddenAt" IS NULL AND OLD."expiredAt" IS NULL AND NEW."deletedAt" IS NULL AND NEW."hiddenAt" IS NULL
      AND NEW."editedAt" IS NOT NULL AND NEW."editedAt" IS DISTINCT FROM OLD."editedAt" AND now() <= OLD."createdAt" + interval '15 minutes' THEN
      INSERT INTO "MessageRevision" (id, "messageId", body, "createdAt") VALUES (gen_random_uuid(), OLD.id, OLD.body, COALESCE(OLD."editedAt", OLD."createdAt"));
    ELSE
      RAISE EXCEPTION 'Message text can only change through an edit within 15 minutes';
    END IF;
  ELSIF NEW."editedAt" IS DISTINCT FROM OLD."editedAt" THEN
    RAISE EXCEPTION 'editedAt changes only with the text';
  END IF;
  RETURN NEW;
END $$;

-- Revisions are history: never edited; removed only together with the message's retention purge.
CREATE OR REPLACE FUNCTION protect_message_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND EXISTS (SELECT 1 FROM "Message" WHERE id = OLD."messageId" AND "expiredAt" IS NOT NULL) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Message revisions are immutable';
END $$;
CREATE TRIGGER message_revision_guard BEFORE UPDATE OR DELETE ON "MessageRevision" FOR EACH ROW EXECUTE FUNCTION protect_message_revision();

-- Attachments: removal (retention) is one more allowed, one-way change of a linked file.
CREATE OR REPLACE FUNCTION protect_message_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scan text[] := ARRAY['messageId','scanStatus','scanAttempts','scanSignature','scannedAt','removedAt'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."messageId" IS NOT NULL THEN RAISE EXCEPTION 'Linked message attachments cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF (to_jsonb(NEW) - scan) IS DISTINCT FROM (to_jsonb(OLD) - scan) THEN RAISE EXCEPTION 'Attachment file identity is immutable'; END IF;
  IF OLD."messageId" IS NOT NULL AND NEW."messageId" IS DISTINCT FROM OLD."messageId" THEN RAISE EXCEPTION 'Attachment is already linked'; END IF;
  IF OLD."messageId" IS NULL AND NEW."messageId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Message" m WHERE m.id = NEW."messageId" AND m."conversationId" = NEW."conversationId") THEN
    RAISE EXCEPTION 'Attachment belongs to another conversation';
  END IF;
  IF OLD."scanStatus" = 'INFECTED' AND NEW."scanStatus" <> 'INFECTED' THEN RAISE EXCEPTION 'Infected attachment cannot be released'; END IF;
  IF OLD."removedAt" IS NOT NULL AND NEW."removedAt" IS DISTINCT FROM OLD."removedAt" THEN RAISE EXCEPTION 'Attachment removal is final'; END IF;
  RETURN NEW;
END $$;

-- Edits, deletions, moderation and pins refresh open conversations. Retention purges of old messages are not
-- signalled: they touch many rows at once and those messages are not expected to be on screen.
CREATE OR REPLACE FUNCTION signal_message_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."expiredAt" IS NOT NULL AND OLD."expiredAt" IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_notify('saleshub_messaging', json_build_object('type', 'update', 'conversationId', NEW."conversationId")::text);
  RETURN NULL;
END $$;
CREATE TRIGGER message_update_signal AFTER UPDATE ON "Message" FOR EACH ROW EXECUTE FUNCTION signal_message_update();
