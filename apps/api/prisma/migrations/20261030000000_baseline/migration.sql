CREATE TABLE "system_metadata" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "system_metadata_pkey" PRIMARY KEY ("key")
);
INSERT INTO "system_metadata" ("key", "value", "updated_at") VALUES ('schema_baseline', 'phase-0', CURRENT_TIMESTAMP);
