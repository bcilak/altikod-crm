-- Reading on one device refreshes the user's notification and conversation badges on others.
CREATE FUNCTION signal_read_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('saleshub_messaging', json_build_object('type', 'notification', 'userId', NEW."userId")::text);
  RETURN NULL;
END $$;
CREATE TRIGGER conversation_read_signal AFTER INSERT OR UPDATE OF "lastReadSeq" ON "ConversationReadState"
FOR EACH ROW EXECUTE FUNCTION signal_read_state();
CREATE TRIGGER notification_read_signal AFTER UPDATE OF "readAt" ON "Notification"
FOR EACH ROW WHEN (OLD."readAt" IS DISTINCT FROM NEW."readAt") EXECUTE FUNCTION signal_read_state();
