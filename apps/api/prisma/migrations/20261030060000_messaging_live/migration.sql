-- Phase 8 (F8-05): mentions, message notifications and live update signals.
ALTER TABLE "Notification" ADD COLUMN "messageId" UUID;
ALTER TABLE "Notification" DROP CONSTRAINT "notification_one_source";
ALTER TABLE "Notification" ADD CONSTRAINT "notification_one_source" CHECK (num_nonnulls("taskId", "quoteVersionId", "messageId") = 1);
CREATE INDEX "Notification_messageId_idx" ON "Notification"("messageId");

CREATE TABLE "MessageMention" (
    "messageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    CONSTRAINT "MessageMention_pkey" PRIMARY KEY ("messageId","userId")
);
CREATE INDEX "MessageMention_userId_idx" ON "MessageMention"("userId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessageMention" ADD CONSTRAINT "MessageMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessageMention" ADD CONSTRAINT "MessageMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Mentions are part of the message: append-only like the message itself.
CREATE OR REPLACE FUNCTION protect_message_mention() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Message mentions are append-only'; END $$;
CREATE TRIGGER message_mention_append_only BEFORE UPDATE OR DELETE ON "MessageMention" FOR EACH ROW EXECUTE FUNCTION protect_message_mention();

-- Live update signals, delivered on commit. Payloads carry identifiers only, never content; the API re-checks
-- the listener's session and conversation access before forwarding anything to a browser.
CREATE OR REPLACE FUNCTION signal_messaging() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'Message' THEN
    PERFORM pg_notify('saleshub_messaging', json_build_object('type', 'message', 'conversationId', NEW."conversationId", 'seq', NEW.seq)::text);
  ELSIF TG_TABLE_NAME = 'MessageAttachment' THEN
    IF NEW."messageId" IS NOT NULL AND NEW."scanStatus" IS DISTINCT FROM OLD."scanStatus" THEN
      PERFORM pg_notify('saleshub_messaging', json_build_object('type', 'attachment', 'conversationId', NEW."conversationId")::text);
    END IF;
  ELSIF TG_TABLE_NAME = 'Notification' THEN
    PERFORM pg_notify('saleshub_messaging', json_build_object('type', 'notification', 'userId', NEW."userId")::text);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER message_signal AFTER INSERT ON "Message" FOR EACH ROW EXECUTE FUNCTION signal_messaging();
CREATE TRIGGER message_attachment_signal AFTER UPDATE ON "MessageAttachment" FOR EACH ROW EXECUTE FUNCTION signal_messaging();
CREATE TRIGGER notification_signal AFTER INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION signal_messaging();
