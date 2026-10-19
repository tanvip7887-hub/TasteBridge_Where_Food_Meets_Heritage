-- Add idempotent, time-limited Dine seat holds while preserving legacy
-- ExperienceBooking rows and the nullable slotId relation.

ALTER TYPE "BookingStatus" ADD VALUE 'EXPIRED';

ALTER TABLE "ExperienceBooking"
  ADD COLUMN "pricePerPersonSnapshot" DECIMAL(14,2),
  ADD COLUMN "totalAmountSnapshot" DECIMAL(14,2),
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestFingerprint" VARCHAR(64),
  ADD COLUMN "holdExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "expiredAt" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "ExperienceBooking_customerId_idempotencyKey_key"
  ON "ExperienceBooking"("customerId", "idempotencyKey");
CREATE INDEX "ExperienceBooking_status_holdExpiresAt_idx"
  ON "ExperienceBooking"("status", "holdExpiresAt");

ALTER TABLE "ExperienceBooking"
  ADD CONSTRAINT "ExperienceBooking_price_snapshots_check"
    CHECK (("pricePerPersonSnapshot" IS NULL) = ("totalAmountSnapshot" IS NULL)),
  ADD CONSTRAINT "ExperienceBooking_idempotency_fingerprint_check"
    CHECK (("idempotencyKey" IS NULL) = ("requestFingerprint" IS NULL)),
  ADD CONSTRAINT "ExperienceBooking_hold_requires_slot_check"
    CHECK ("holdExpiresAt" IS NULL OR "slotId" IS NOT NULL),
  ADD CONSTRAINT "ExperienceBooking_price_snapshot_positive_check"
    CHECK ("pricePerPersonSnapshot" IS NULL OR "pricePerPersonSnapshot" > 0),
  ADD CONSTRAINT "ExperienceBooking_total_snapshot_positive_check"
    CHECK ("totalAmountSnapshot" IS NULL OR "totalAmountSnapshot" > 0);
