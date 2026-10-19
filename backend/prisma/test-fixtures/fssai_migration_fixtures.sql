-- Synthetic legacy fixtures for 20261015120000_add_fssai_workflow.
-- Run only in an isolated test database after 20261014120000 has been applied
-- and before 20261015120000 is applied. Migration 14 supplies fssaiStatusType
-- and fssaiExpiryDate; this file deliberately uses no migration-15 columns.
-- All identifiers, emails, document URLs, and data below are fabricated.

BEGIN;

INSERT INTO "User" ("id", "name", "email", "passwordHash", "role", "updatedAt")
VALUES
  ('fssai_mig_replace', 'Synthetic Replacement Cook', 'fssai-mig-replace@example.invalid', 'synthetic-test-only', 'COOK', CURRENT_TIMESTAMP),
  ('fssai_mig_tie', 'Synthetic Tied Timestamp Cook', 'fssai-mig-tie@example.invalid', 'synthetic-test-only', 'COOK', CURRENT_TIMESTAMP),
  ('fssai_mig_missing', 'Synthetic Missing Expiry Cook', 'fssai-mig-missing@example.invalid', 'synthetic-test-only', 'COOK', CURRENT_TIMESTAMP),
  ('fssai_mig_expired', 'Synthetic Expired Cook', 'fssai-mig-expired@example.invalid', 'synthetic-test-only', 'COOK', CURRENT_TIMESTAMP),
  ('fssai_mig_history', 'Synthetic History Cook', 'fssai-mig-history@example.invalid', 'synthetic-test-only', 'COOK', CURRENT_TIMESTAMP),
  ('fssai_mig_foscos', 'Synthetic FoSCoS Cook', 'fssai-mig-foscos@example.invalid', 'synthetic-test-only', 'COOK', CURRENT_TIMESTAMP),
  ('fssai_mig_revision', 'Synthetic Revision Cook', 'fssai-mig-revision@example.invalid', 'synthetic-test-only', 'COOK', CURRENT_TIMESTAMP),
  ('fssai_mig_approved', 'Synthetic Approved Cook', 'fssai-mig-approved@example.invalid', 'synthetic-test-only', 'COOK', CURRENT_TIMESTAMP);

INSERT INTO "CookProfile" (
  "id", "userId", "businessName", "fssaiNumber", "fssaiStatusType",
  "fssaiExpiryDate", "fssaiStatus", "revisionReason", "updatedAt"
)
VALUES
  ('fssai_mig_replace_profile', 'fssai_mig_replace', 'Synthetic Replacement Kitchen', NULL, 'HAVE_REGISTRATION', TIMESTAMP '2030-01-01 00:00:00', 'APPROVED', NULL, CURRENT_TIMESTAMP),
  ('fssai_mig_tie_profile', 'fssai_mig_tie', 'Synthetic Tie Kitchen', NULL, 'HAVE_REGISTRATION', TIMESTAMP '2030-01-01 00:00:00', 'APPROVED', NULL, CURRENT_TIMESTAMP),
  ('fssai_mig_missing_profile', 'fssai_mig_missing', 'Synthetic Missing Expiry Kitchen', NULL, 'HAVE_REGISTRATION', NULL, 'APPROVED', NULL, CURRENT_TIMESTAMP),
  ('fssai_mig_expired_profile', 'fssai_mig_expired', 'Synthetic Expired Kitchen', NULL, 'HAVE_REGISTRATION', TIMESTAMP '2020-01-01 00:00:00', 'APPROVED', NULL, CURRENT_TIMESTAMP),
  ('fssai_mig_history_profile', 'fssai_mig_history', 'Synthetic History Kitchen', NULL, 'HAVE_REGISTRATION', TIMESTAMP '2030-01-01 00:00:00', 'APPROVED', NULL, CURRENT_TIMESTAMP),
  ('fssai_mig_foscos_profile', 'fssai_mig_foscos', 'Synthetic FoSCoS Kitchen', 'SYNTHETIC-APP-REF-71', 'APPLIED_ON_FOSCOS', NULL, 'PENDING', NULL, CURRENT_TIMESTAMP),
  ('fssai_mig_revision_profile', 'fssai_mig_revision', 'Synthetic Revision Kitchen', NULL, 'HAVE_REGISTRATION', NULL, 'NEEDS_REVISION', 'Synthetic profile revision note.', CURRENT_TIMESTAMP),
  ('fssai_mig_approved_profile', 'fssai_mig_approved', 'Synthetic Current Approval Kitchen', NULL, 'HAVE_REGISTRATION', TIMESTAMP '2031-01-01 00:00:00', 'APPROVED', NULL, CURRENT_TIMESTAMP);

INSERT INTO "VerificationDocument" (
  "id", "userId", "documentType", "documentUrl", "documentNumber",
  "verificationStatus", "rejectionReason", "createdAt", "updatedAt"
)
VALUES
  ('fssai_mig_replace_old_approved', 'fssai_mig_replace', 'FSSAI_LICENSE', 'synthetic://fssai/replace-old', 'SYNTHETIC-LIC-REPLACE-OLD', 'APPROVED', NULL, TIMESTAMP '2026-01-01 12:00:00', TIMESTAMP '2026-01-01 12:00:00'),
  ('fssai_mig_replace_new_pending', 'fssai_mig_replace', 'FSSAI_LICENSE', 'synthetic://fssai/replace-new', 'SYNTHETIC-LIC-REPLACE-NEW', 'PENDING', NULL, TIMESTAMP '2026-02-01 12:00:00', TIMESTAMP '2026-02-01 12:00:00'),

  -- Same newest timestamp; id DESC selects the approved row, so the ambiguity guard is exercised.
  ('zz_fssai_mig_tie_approved', 'fssai_mig_tie', 'FSSAI_LICENSE', 'synthetic://fssai/tie-approved', 'SYNTHETIC-LIC-TIE-APPROVED', 'APPROVED', NULL, TIMESTAMP '2026-03-01 12:00:00', TIMESTAMP '2026-03-01 12:00:00'),
  ('aa_fssai_mig_tie_pending', 'fssai_mig_tie', 'FSSAI_LICENSE', 'synthetic://fssai/tie-pending', 'SYNTHETIC-LIC-TIE-PENDING', 'PENDING', NULL, TIMESTAMP '2026-03-01 12:00:00', TIMESTAMP '2026-03-01 12:00:00'),

  ('fssai_mig_missing_approved', 'fssai_mig_missing', 'FSSAI_LICENSE', 'synthetic://fssai/missing-expiry', 'SYNTHETIC-LIC-MISSING-EXPIRY', 'APPROVED', NULL, TIMESTAMP '2026-04-01 12:00:00', TIMESTAMP '2026-04-01 12:00:00'),
  ('fssai_mig_expired_approved', 'fssai_mig_expired', 'FSSAI_LICENSE', 'synthetic://fssai/expired', 'SYNTHETIC-LIC-EXPIRED', 'APPROVED', NULL, TIMESTAMP '2026-05-01 12:00:00', TIMESTAMP '2026-05-01 12:00:00'),

  ('fssai_mig_history_old_rejected', 'fssai_mig_history', 'FSSAI_LICENSE', 'synthetic://fssai/history-old', 'SYNTHETIC-LIC-HISTORY-OLD', 'REJECTED', 'Synthetic historical rejection.', TIMESTAMP '2026-01-15 12:00:00', TIMESTAMP '2026-01-15 12:00:00'),
  ('fssai_mig_history_new_pending', 'fssai_mig_history', 'FSSAI_LICENSE', 'synthetic://fssai/history-new', 'SYNTHETIC-LIC-HISTORY-NEW', 'PENDING', NULL, TIMESTAMP '2026-06-01 12:00:00', TIMESTAMP '2026-06-01 12:00:00'),

  ('fssai_mig_revision_doc', 'fssai_mig_revision', 'FSSAI_LICENSE', 'synthetic://fssai/revision', 'SYNTHETIC-LIC-REVISION', 'NEEDS_REVISION', 'Synthetic document revision reason.', TIMESTAMP '2026-07-01 12:00:00', TIMESTAMP '2026-07-01 12:00:00'),
  ('fssai_mig_approved_doc', 'fssai_mig_approved', 'FSSAI_LICENSE', 'synthetic://fssai/approved-current', 'SYNTHETIC-LIC-APPROVED-CURRENT', 'APPROVED', NULL, TIMESTAMP '2026-08-01 12:00:00', TIMESTAMP '2026-08-01 12:00:00');

COMMIT;
