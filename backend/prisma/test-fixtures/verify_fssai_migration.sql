-- Read-only assertions for fssai_migration_fixtures.sql.
-- Run only after 20261015120000_add_fssai_workflow has been applied to the
-- same isolated test database. Raises an error if any expectation is false.

DO $verify$
DECLARE
  actual_status "FssaiWorkflowStatus";
  actual_document_status "VerificationStatus";
  actual_expiry TIMESTAMP(3);
  actual_text TEXT;
  actual_text_2 TEXT;
  retained_count INTEGER;
BEGIN
  SELECT "fssaiStatus" INTO actual_status FROM "CookProfile" WHERE "userId" = 'fssai_mig_replace';
  IF actual_status IS DISTINCT FROM 'SUBMITTED' THEN
    RAISE EXCEPTION 'replacement fixture: expected SUBMITTED, got %', actual_status;
  END IF;
  SELECT "verificationStatus" INTO actual_document_status FROM "VerificationDocument" WHERE "id" = 'fssai_mig_replace_new_pending';
  IF actual_document_status IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION 'replacement fixture: new document should remain PENDING, got %', actual_document_status;
  END IF;
  SELECT "verificationStatus", "expiryDate" INTO actual_document_status, actual_expiry FROM "VerificationDocument" WHERE "id" = 'fssai_mig_replace_old_approved';
  IF actual_document_status IS DISTINCT FROM 'APPROVED' OR actual_expiry IS NOT NULL THEN
    RAISE EXCEPTION 'replacement fixture: historical approval should remain historical and must not receive the active expiry';
  END IF;
  SELECT COUNT(*) INTO retained_count FROM "VerificationDocument" WHERE "userId" = 'fssai_mig_replace';
  IF retained_count <> 2 THEN
    RAISE EXCEPTION 'replacement fixture: expected 2 retained document rows, got %', retained_count;
  END IF;

  SELECT "fssaiStatus" INTO actual_status FROM "CookProfile" WHERE "userId" = 'fssai_mig_tie';
  IF actual_status IS DISTINCT FROM 'NOT_SUBMITTED' THEN
    RAISE EXCEPTION 'tied timestamp fixture: expected fail-closed NOT_SUBMITTED, got %', actual_status;
  END IF;
  SELECT "expiryDate" INTO actual_expiry FROM "VerificationDocument" WHERE "id" = 'zz_fssai_mig_tie_approved';
  IF actual_expiry IS NOT NULL THEN
    RAISE EXCEPTION 'tied timestamp fixture: ambiguous document must not receive expiry';
  END IF;
  SELECT COUNT(*) INTO retained_count FROM "VerificationDocument" WHERE "userId" = 'fssai_mig_tie';
  IF retained_count <> 2 THEN
    RAISE EXCEPTION 'tied timestamp fixture: expected both document rows to remain, got %', retained_count;
  END IF;

  SELECT "fssaiStatus" INTO actual_status FROM "CookProfile" WHERE "userId" = 'fssai_mig_missing';
  SELECT "fssaiExpiryDate" INTO actual_expiry FROM "CookProfile" WHERE "userId" = 'fssai_mig_missing';
  SELECT "verificationStatus" INTO actual_document_status FROM "VerificationDocument" WHERE "id" = 'fssai_mig_missing_approved';
  IF actual_status IS DISTINCT FROM 'SUBMITTED' OR actual_document_status IS DISTINCT FROM 'PENDING' OR actual_expiry IS NOT NULL THEN
    RAISE EXCEPTION 'missing expiry fixture: expected profile SUBMITTED and document PENDING; got %, %', actual_status, actual_document_status;
  END IF;

  SELECT "fssaiStatus" INTO actual_status FROM "CookProfile" WHERE "userId" = 'fssai_mig_expired';
  IF actual_status IS DISTINCT FROM 'EXPIRED' THEN
    RAISE EXCEPTION 'expired fixture: expected EXPIRED, got %', actual_status;
  END IF;
  SELECT "fssaiExpiryDate" INTO actual_expiry FROM "CookProfile" WHERE "userId" = 'fssai_mig_expired';
  IF actual_expiry IS DISTINCT FROM TIMESTAMP '2020-01-01 00:00:00' THEN
    RAISE EXCEPTION 'expired fixture: legacy profile expiry should be preserved, got %', actual_expiry;
  END IF;
  SELECT "expiryDate" INTO actual_expiry FROM "VerificationDocument" WHERE "id" = 'fssai_mig_expired_approved';
  IF actual_expiry IS NOT NULL THEN
    RAISE EXCEPTION 'expired fixture: expired legacy date should not be copied to the certificate';
  END IF;

  SELECT "fssaiStatus" INTO actual_status FROM "CookProfile" WHERE "userId" = 'fssai_mig_history';
  SELECT "verificationStatus" INTO actual_document_status FROM "VerificationDocument" WHERE "id" = 'fssai_mig_history_old_rejected';
  SELECT COUNT(*) INTO retained_count FROM "VerificationDocument" WHERE "userId" = 'fssai_mig_history';
  IF actual_status IS DISTINCT FROM 'SUBMITTED' OR actual_document_status IS DISTINCT FROM 'REJECTED' OR retained_count <> 2 THEN
    RAISE EXCEPTION 'history fixture: expected SUBMITTED, preserved old REJECTED row, and 2 documents; got %, %, %', actual_status, actual_document_status, retained_count;
  END IF;

  SELECT "fssaiStatus", "fssaiApplicationReference", "fssaiNumber"
    INTO actual_status, actual_text, actual_text_2
    FROM "CookProfile" WHERE "userId" = 'fssai_mig_foscos';
  IF actual_status IS DISTINCT FROM 'IN_PROCESS' OR actual_text IS DISTINCT FROM 'SYNTHETIC-APP-REF-71' OR actual_text_2 IS NOT NULL THEN
    RAISE EXCEPTION 'FoSCoS fixture: expected IN_PROCESS and moved application reference';
  END IF;
  IF EXISTS (SELECT 1 FROM "CookProfile" WHERE "userId" = 'fssai_mig_foscos' AND "fssaiNumber" IS NOT NULL) THEN
    RAISE EXCEPTION 'FoSCoS fixture: legacy fssaiNumber should be cleared after moving the reference';
  END IF;

  SELECT "fssaiStatus", "fssaiRejectionReason", "revisionReason"
    INTO actual_status, actual_text, actual_text_2
    FROM "CookProfile" WHERE "userId" = 'fssai_mig_revision';
  IF actual_status IS DISTINCT FROM 'REJECTED' OR actual_text IS DISTINCT FROM 'Synthetic document revision reason.' THEN
    RAISE EXCEPTION 'revision fixture: expected REJECTED and copied document reason';
  END IF;
  IF actual_text_2 IS DISTINCT FROM 'Synthetic profile revision note.' THEN
    RAISE EXCEPTION 'revision fixture: unrelated profile revisionReason changed';
  END IF;

  SELECT "fssaiStatus" INTO actual_status FROM "CookProfile" WHERE "userId" = 'fssai_mig_approved';
  SELECT "expiryDate" INTO actual_expiry FROM "VerificationDocument" WHERE "id" = 'fssai_mig_approved_doc';
  IF actual_status IS DISTINCT FROM 'APPROVED' OR actual_expiry IS DISTINCT FROM TIMESTAMP '2031-01-01 00:00:00' THEN
    RAISE EXCEPTION 'valid legacy approval fixture: expected APPROVED and copied future expiry, got status %, expiry %', actual_status, actual_expiry;
  END IF;
END;
$verify$;
