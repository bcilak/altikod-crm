-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "acceptedQuoteVersionId" UUID;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "quoteVersionId" UUID,
ALTER COLUMN "taskId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SalesSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "sellerName" TEXT NOT NULL DEFAULT 'IT SalesHub',
    "sellerAddress" TEXT NOT NULL DEFAULT '',
    "sellerEmail" TEXT NOT NULL DEFAULT '',
    "defaultTerms" TEXT NOT NULL DEFAULT '',
    "autoApproval" BOOLEAN NOT NULL DEFAULT false,
    "maxDiscountPct" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "minMarginPct" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SalesSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT,
    "description" TEXT NOT NULL,
    "salesPitch" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "listPrice" DECIMAL(18,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "cost" DECIMAL(18,4),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "companyId" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteVersion" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "lockVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL,
    "validUntil" TIMESTAMPTZ(6) NOT NULL,
    "terms" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discountPct" DECIMAL(7,4) NOT NULL,
    "subtotal" DECIMAL(18,4) NOT NULL,
    "discountTotal" DECIMAL(18,4) NOT NULL,
    "taxTotal" DECIMAL(18,4) NOT NULL,
    "total" DECIMAL(18,4) NOT NULL,
    "costTotal" DECIMAL(18,4),
    "marginPct" DECIMAL(18,4),
    "snapshot" JSONB NOT NULL,
    "policySnapshot" JSONB,
    "approvalMethod" TEXT,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMPTZ(6),
    "sentAt" TIMESTAMPTZ(6),
    "acceptedAt" TIMESTAMPTZ(6),
    "acceptanceNote" TEXT,
    "pdfKey" TEXT,
    "pdfChecksum" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "QuoteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" UUID NOT NULL,
    "quoteVersionId" UUID NOT NULL,
    "productId" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discountPct" DECIMAL(7,4) NOT NULL,
    "taxPct" DECIMAL(7,4) NOT NULL,
    "unitCost" DECIMAL(18,4),
    "net" DECIMAL(18,4) NOT NULL,
    "tax" DECIMAL(18,4) NOT NULL,
    "total" DECIMAL(18,4) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteEvent" (
    "id" UUID NOT NULL,
    "quoteVersionId" UUID NOT NULL,
    "fromStatus" "QuoteStatus",
    "toStatus" "QuoteStatus" NOT NULL,
    "actorId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Handoff" (
    "id" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "acceptedQuoteVersionId" UUID,
    "taskId" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "contractUrl" TEXT,
    "snapshot" JSONB NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Handoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rows" JSONB NOT NULL,
    "errors" JSONB NOT NULL,
    "resultIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_number_key" ON "Quote"("number");

-- CreateIndex
CREATE INDEX "Quote_companyId_createdAt_idx" ON "Quote"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteVersion_status_validUntil_idx" ON "QuoteVersion"("status", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteVersion_quoteId_versionNumber_key" ON "QuoteVersion"("quoteId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteItem_quoteVersionId_position_key" ON "QuoteItem"("quoteVersionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Handoff_opportunityId_key" ON "Handoff"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "Handoff_taskId_key" ON "Handoff"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_acceptedQuoteVersionId_key" ON "Opportunity"("acceptedQuoteVersionId");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteVersion" ADD CONSTRAINT "QuoteVersion_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "QuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteEvent" ADD CONSTRAINT "QuoteEvent_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "QuoteVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handoff" ADD CONSTRAINT "Handoff_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handoff" ADD CONSTRAINT "Handoff_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Opportunity" ADD CONSTRAINT "accepted_quote_fk" FOREIGN KEY ("acceptedQuoteVersionId") REFERENCES "QuoteVersion"(id);
ALTER TABLE "Notification" ADD CONSTRAINT "quote_notification_fk" FOREIGN KEY ("quoteVersionId") REFERENCES "QuoteVersion"(id), ADD CONSTRAINT "notification_one_source" CHECK (num_nonnulls("taskId", "quoteVersionId") = 1);
ALTER TABLE "Handoff" ADD CONSTRAINT "handoff_task_fk" FOREIGN KEY ("taskId") REFERENCES "Task"(id), ADD CONSTRAINT "handoff_owner_fk" FOREIGN KEY ("ownerId") REFERENCES "User"(id), ADD CONSTRAINT "handoff_quote_fk" FOREIGN KEY ("acceptedQuoteVersionId") REFERENCES "QuoteVersion"(id);
ALTER TABLE "QuoteItem" ADD CONSTRAINT "quote_line_ranges" CHECK (quantity > 0 AND "unitPrice" >= 0 AND ("unitCost" IS NULL OR "unitCost" >= 0) AND "discountPct" BETWEEN 0 AND 100 AND "taxPct" BETWEEN 0 AND 100 AND net >= 0 AND tax >= 0 AND total >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "product_ranges" CHECK ("listPrice" >= 0 AND (cost IS NULL OR cost >= 0) AND status IN ('DRAFT','APPROVED','RETIRED'));
ALTER TABLE "SalesSettings" ADD CONSTRAINT "approval_ranges" CHECK ("maxDiscountPct" BETWEEN 0 AND 100 AND "minMarginPct" BETWEEN 0 AND 100);
INSERT INTO "SalesSettings" (id, "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);
INSERT INTO "RolePermission" (role, resource, action)
SELECT role::"Role", resource, action FROM (VALUES ('ADMIN'),('MANAGER')) r(role)
CROSS JOIN (VALUES ('catalog','manage'),('finance','read'),('quotes','approve')) p(resource,action);
INSERT INTO "RolePermission" (role, resource, action) VALUES ('ADMIN','settings','manage');
INSERT INTO "RolePermission" (role, resource, action)
SELECT role::"Role", resource, action FROM (VALUES ('ADMIN'),('MANAGER'),('SALES')) r(role)
CROSS JOIN (VALUES ('reports','read'),('exports','read')) p(resource,action);

CREATE FUNCTION protect_quote_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND (to_jsonb(NEW) - ARRAY['status','lockVersion','approvalMethod','approvedBy','approvedAt','sentAt','acceptedAt','acceptanceNote','pdfKey','pdfChecksum','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','lockVersion','approvalMethod','approvedBy','approvedAt','sentAt','acceptedAt','acceptanceNote','pdfKey','pdfChecksum','updatedAt']) THEN
    RAISE EXCEPTION 'Submitted quote content is immutable';
  END IF;
  IF OLD."pdfKey" IS NOT NULL AND (NEW."pdfKey" IS DISTINCT FROM OLD."pdfKey" OR NEW."pdfChecksum" IS DISTINCT FROM OLD."pdfChecksum") THEN RAISE EXCEPTION 'Stored PDF is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER quote_content_immutable BEFORE UPDATE ON "QuoteVersion" FOR EACH ROW EXECUTE FUNCTION protect_quote_content();
CREATE FUNCTION protect_quote_items() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id uuid;
BEGIN
  parent_id := CASE WHEN TG_OP = 'INSERT' THEN NEW."quoteVersionId" ELSE OLD."quoteVersionId" END;
  IF EXISTS (SELECT 1 FROM "QuoteVersion" WHERE id = parent_id AND status <> 'DRAFT') THEN RAISE EXCEPTION 'Submitted quote items are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER quote_items_immutable BEFORE INSERT OR UPDATE OR DELETE ON "QuoteItem" FOR EACH ROW EXECUTE FUNCTION protect_quote_items();
