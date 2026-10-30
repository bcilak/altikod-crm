-- Faz 9: Web Push subscriptions, push delivery claim and message reactions.
-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "pushClaimedAt" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "showPreview" BOOLEAN NOT NULL DEFAULT false,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageReaction" (
    "messageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("messageId","userId","emoji")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "PushSubscription_sessionId_idx" ON "PushSubscription"("sessionId");

-- CreateIndex
CREATE INDEX "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PushSubscription" ADD CONSTRAINT "push_subscription_shape" CHECK (
  "endpoint" ~ '^https?://' AND char_length("endpoint") <= 1000 AND char_length("p256dh") BETWEEN 80 AND 100 AND char_length("auth") BETWEEN 16 AND 30
  AND char_length("label") BETWEEN 1 AND 80 AND "failures" >= 0
);
-- Fixed reaction set (also enforced by the API).
ALTER TABLE "MessageReaction" ADD CONSTRAINT "message_reaction_emoji" CHECK ("emoji" IN ('👍', '✅', '❤️', '😂', '👀', '🙏'));
CREATE INDEX "Notification_push_pending_idx" ON "Notification"("createdAt") WHERE "pushClaimedAt" IS NULL;

-- The notification signal now names the notification, so exactly one API process can claim its push delivery.
CREATE OR REPLACE FUNCTION signal_messaging() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'Message' THEN
    PERFORM pg_notify('saleshub_messaging', json_build_object('type', 'message', 'conversationId', NEW."conversationId", 'seq', NEW.seq)::text);
  ELSIF TG_TABLE_NAME = 'MessageAttachment' THEN
    IF NEW."messageId" IS NOT NULL AND NEW."scanStatus" IS DISTINCT FROM OLD."scanStatus" THEN
      PERFORM pg_notify('saleshub_messaging', json_build_object('type', 'attachment', 'conversationId', NEW."conversationId")::text);
    END IF;
  ELSIF TG_TABLE_NAME = 'Notification' THEN
    PERFORM pg_notify('saleshub_messaging', json_build_object('type', 'notification', 'userId', NEW."userId", 'notificationId', NEW.id)::text);
  END IF;
  RETURN NULL;
END $$;

-- Reactions refresh open conversations like other message updates.
CREATE OR REPLACE FUNCTION signal_message_reaction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid := COALESCE(NEW."messageId", OLD."messageId");
BEGIN
  PERFORM pg_notify('saleshub_messaging', json_build_object('type', 'update', 'conversationId', (SELECT "conversationId" FROM "Message" WHERE id = target))::text);
  RETURN NULL;
END $$;
CREATE TRIGGER message_reaction_signal AFTER INSERT OR DELETE ON "MessageReaction" FOR EACH ROW EXECUTE FUNCTION signal_message_reaction();

-- Notifications created before push existed are never pushed retroactively.
UPDATE "Notification" SET "pushClaimedAt" = "createdAt" WHERE "pushClaimedAt" IS NULL;
