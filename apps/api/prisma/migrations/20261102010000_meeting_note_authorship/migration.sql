-- Legacy notes deliberately remain unattributed: meeting creation is not note creation.
ALTER TABLE "Meeting"
  ADD COLUMN "notesCreatedBy" UUID,
  ADD COLUMN "notesCreatedByName" TEXT,
  ADD COLUMN "notesCreatedAt" TIMESTAMPTZ(6),
  ADD COLUMN "notesUpdatedBy" UUID,
  ADD COLUMN "notesUpdatedByName" TEXT,
  ADD COLUMN "notesUpdatedAt" TIMESTAMPTZ(6);
