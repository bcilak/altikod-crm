-- Phase 8 (F8-04): message attachments with malware scan state.
-- CreateEnum
CREATE TYPE "AttachmentScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED', 'UNSCANNED');

-- CreateTable
CREATE TABLE "MessageAttachment" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "messageId" UUID,
    "uploadedById" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "fileKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "scanStatus" "AttachmentScanStatus" NOT NULL,
    "scanAttempts" INTEGER NOT NULL DEFAULT 0,
    "scanSignature" TEXT,
    "scannedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageAttachment_messageId_idx" ON "MessageAttachment"("messageId");

-- CreateIndex
CREATE INDEX "MessageAttachment_conversationId_createdAt_idx" ON "MessageAttachment"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageAttachment_scanStatus_idx" ON "MessageAttachment"("scanStatus");

-- CreateIndex
CREATE INDEX "MessageAttachment_uploadedById_messageId_idx" ON "MessageAttachment"("uploadedById", "messageId");

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MessageAttachment" ADD CONSTRAINT "message_attachment_shape" CHECK (
  "size" > 0 AND "size" <= 20971520 AND char_length("name") BETWEEN 1 AND 150
  AND "fileKey" ~ '^[a-f0-9]{64}\.(pdf|png|jpg|docx|xlsx|pptx|csv|txt)$' AND "checksum" ~ '^[a-f0-9]{64}$'
  AND "scanAttempts" >= 0 AND ("scanStatus" = 'INFECTED') = ("scanSignature" IS NOT NULL)
);

-- A message may now consist of files only; the service still requires text or at least one file.
ALTER TABLE "Message" DROP CONSTRAINT "message_body_length";
ALTER TABLE "Message" ADD CONSTRAINT "message_body_length" CHECK (char_length("body") <= 4000 AND "seq" > 0);

-- File identity is immutable; only scan state changes. A file is linked once, to a message of its own conversation,
-- and linked files can no longer be deleted (unlinked drafts can be cleaned up).
CREATE OR REPLACE FUNCTION protect_message_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scan text[] := ARRAY['messageId','scanStatus','scanAttempts','scanSignature','scannedAt'];
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
  RETURN NEW;
END $$;
CREATE TRIGGER message_attachment_guard BEFORE UPDATE OR DELETE ON "MessageAttachment" FOR EACH ROW EXECUTE FUNCTION protect_message_attachment();
