CREATE TYPE "FssaiWorkflowStatus" AS ENUM (
  'NOT_SUBMITTED',
  'IN_PROCESS',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'EXPIRED'
);

ALTER TABLE "CookProfile"
  ADD COLUMN "fssaiApplicationReference" TEXT;

ALTER TABLE "VerificationDocument"
  ADD COLUMN "expiryDate" TIMESTAMP(3);

-- Legacy applications used one value for either a licence number or an
-- application reference. The recorded registration type distinguishes them.
UPDATE "CookProfile"
SET "fssaiApplicationReference" = "fssaiNumber", "fssaiNumber" = NULL
WHERE "fssaiStatusType" = 'APPLIED_ON_FOSCOS'
  AND "fssaiNumber" IS NOT NULL;

-- Preserve only legacy approvals backed by an explicitly approved FSSAI document
-- and a recorded future expiry. Everything else fails closed for review.
UPDATE "VerificationDocument" d
SET "expiryDate" = cp."fssaiExpiryDate"
FROM "CookProfile" cp
WHERE d."userId" = cp."userId"
  AND d."documentType" = 'FSSAI_LICENSE'
  AND d."verificationStatus" = 'APPROVED'
  AND cp."fssaiStatus" = 'APPROVED'
  AND cp."fssaiExpiryDate" > CURRENT_TIMESTAMP
  AND d."id" = (
    SELECT latest."id"
    FROM "VerificationDocument" latest
    WHERE latest."userId" = cp."userId"
      AND latest."documentType" = 'FSSAI_LICENSE'
    ORDER BY latest."createdAt" DESC, latest."id" DESC
    LIMIT 1
  )
  -- If multiple FSSAI documents share the newest timestamp, do not attach the
  -- legacy profile expiry to one arbitrarily selected document.
  AND NOT EXISTS (
    SELECT 1
    FROM "VerificationDocument" ambiguous
    WHERE ambiguous."userId" = cp."userId"
      AND ambiguous."documentType" = 'FSSAI_LICENSE'
      AND ambiguous."id" <> d."id"
      AND ambiguous."createdAt" >= d."createdAt"
  );

UPDATE "CookProfile" cp
SET "fssaiRejectionReason" = latest."rejectionReason"
FROM "VerificationDocument" latest
WHERE cp."userId" = latest."userId"
  AND cp."fssaiRejectionReason" IS NULL
  AND latest."documentType" = 'FSSAI_LICENSE'
  AND latest."id" = (
    SELECT current_doc."id"
    FROM "VerificationDocument" current_doc
    WHERE current_doc."userId" = cp."userId"
      AND current_doc."documentType" = 'FSSAI_LICENSE'
    ORDER BY current_doc."createdAt" DESC, current_doc."id" DESC
    LIMIT 1
  )
  AND latest."verificationStatus" IN ('REJECTED', 'NEEDS_REVISION');

-- An old profile-level approval without an expiry cannot remain approved.
-- Make its latest previously approved certificate reviewable again.
UPDATE "VerificationDocument" d
SET "verificationStatus" = CASE WHEN cp."fssaiExpiryDate" IS NULL THEN 'PENDING'::"VerificationStatus" ELSE 'NEEDS_REVISION'::"VerificationStatus" END
FROM "CookProfile" cp
WHERE d."userId" = cp."userId"
  AND d."documentType" = 'FSSAI_LICENSE'
  AND d."verificationStatus" = 'APPROVED'
  AND cp."fssaiStatus" = 'APPROVED'
  AND cp."fssaiExpiryDate" IS NULL
  AND d."id" = (
    SELECT latest."id"
    FROM "VerificationDocument" latest
    WHERE latest."userId" = cp."userId"
      AND latest."documentType" = 'FSSAI_LICENSE'
    ORDER BY latest."createdAt" DESC, latest."id" DESC
    LIMIT 1
  );

ALTER TABLE "CookProfile" ADD COLUMN "fssaiStatusV2" "FssaiWorkflowStatus";

UPDATE "CookProfile" cp
SET "fssaiStatusV2" = (
  CASE
    WHEN cp."fssaiStatus" = 'APPROVED' AND cp."fssaiExpiryDate" <= CURRENT_TIMESTAMP THEN 'EXPIRED'
    WHEN cp."fssaiStatus" = 'APPROVED'
      AND cp."fssaiExpiryDate" > CURRENT_TIMESTAMP
      AND EXISTS (
        SELECT 1 FROM "VerificationDocument" d
        WHERE d."userId" = cp."userId"
          AND d."documentType" = 'FSSAI_LICENSE'
          AND d."verificationStatus" = 'APPROVED'
          AND d."expiryDate" = cp."fssaiExpiryDate"
          AND d."id" = (
            SELECT latest."id" FROM "VerificationDocument" latest
            WHERE latest."userId" = cp."userId"
              AND latest."documentType" = 'FSSAI_LICENSE'
            ORDER BY latest."createdAt" DESC, latest."id" DESC LIMIT 1
          )
          -- A tied newest timestamp is ambiguous; do not preserve approval.
          AND NOT EXISTS (
            SELECT 1 FROM "VerificationDocument" ambiguous
            WHERE ambiguous."userId" = cp."userId"
              AND ambiguous."documentType" = 'FSSAI_LICENSE'
              AND ambiguous."id" <> d."id"
              AND ambiguous."createdAt" >= d."createdAt"
          )
      ) THEN 'APPROVED'
    WHEN cp."fssaiStatus" = 'REJECTED' OR cp."fssaiStatus" = 'NEEDS_REVISION'
      OR EXISTS (
        SELECT 1 FROM "VerificationDocument" d
        WHERE d."userId" = cp."userId"
          AND d."documentType" = 'FSSAI_LICENSE'
          AND d."verificationStatus" IN ('REJECTED', 'NEEDS_REVISION')
          AND d."id" = (
            SELECT latest."id" FROM "VerificationDocument" latest
            WHERE latest."userId" = cp."userId"
              AND latest."documentType" = 'FSSAI_LICENSE'
            ORDER BY latest."createdAt" DESC, latest."id" DESC LIMIT 1
          )
      ) THEN 'REJECTED'
    WHEN EXISTS (
      SELECT 1 FROM "VerificationDocument" d
      WHERE d."userId" = cp."userId"
        AND d."documentType" = 'FSSAI_LICENSE'
        AND d."verificationStatus" = 'PENDING'
        AND d."id" = (
          SELECT latest."id" FROM "VerificationDocument" latest
          WHERE latest."userId" = cp."userId"
            AND latest."documentType" = 'FSSAI_LICENSE'
          ORDER BY latest."createdAt" DESC, latest."id" DESC LIMIT 1
        )
    ) THEN 'SUBMITTED'
    WHEN cp."fssaiStatusType" = 'APPLIED_ON_FOSCOS' THEN 'IN_PROCESS'
    ELSE 'NOT_SUBMITTED'
  END
)::"FssaiWorkflowStatus";

ALTER TABLE "CookProfile" DROP COLUMN "fssaiStatus";
ALTER TABLE "CookProfile" RENAME COLUMN "fssaiStatusV2" TO "fssaiStatus";
ALTER TABLE "CookProfile" ALTER COLUMN "fssaiStatus" SET NOT NULL;
ALTER TABLE "CookProfile" ALTER COLUMN "fssaiStatus" SET DEFAULT 'NOT_SUBMITTED';
