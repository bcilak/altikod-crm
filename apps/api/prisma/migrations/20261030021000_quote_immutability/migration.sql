CREATE OR REPLACE FUNCTION protect_quote_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'Submitted quote cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' AND NEW.status = 'DRAFT' THEN RAISE EXCEPTION 'Submitted quote cannot return to draft'; END IF;
  IF OLD.status <> 'DRAFT' AND (to_jsonb(NEW) - ARRAY['status','lockVersion','approvalMethod','approvedBy','approvedAt','sentAt','acceptedAt','acceptanceNote','pdfKey','pdfChecksum','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','lockVersion','approvalMethod','approvedBy','approvedAt','sentAt','acceptedAt','acceptanceNote','pdfKey','pdfChecksum','updatedAt']) THEN
    RAISE EXCEPTION 'Submitted quote content is immutable';
  END IF;
  IF OLD."pdfKey" IS NOT NULL AND (NEW."pdfKey" IS DISTINCT FROM OLD."pdfKey" OR NEW."pdfChecksum" IS DISTINCT FROM OLD."pdfChecksum") THEN RAISE EXCEPTION 'Stored PDF is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER quote_delete_immutable BEFORE DELETE ON "QuoteVersion" FOR EACH ROW EXECUTE FUNCTION protect_quote_content();
CREATE OR REPLACE FUNCTION protect_quote_items() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status "QuoteStatus";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT status INTO parent_status FROM "QuoteVersion" WHERE id = OLD."quoteVersionId" FOR SHARE;
    IF parent_status <> 'DRAFT' THEN RAISE EXCEPTION 'Submitted quote items are immutable'; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT status INTO parent_status FROM "QuoteVersion" WHERE id = NEW."quoteVersionId" FOR SHARE;
    IF parent_status <> 'DRAFT' THEN RAISE EXCEPTION 'Submitted quote items are immutable'; END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
