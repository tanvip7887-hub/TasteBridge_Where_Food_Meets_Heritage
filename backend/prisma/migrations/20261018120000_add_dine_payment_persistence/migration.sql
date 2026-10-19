-- Dine Option A persistence foundation. This migration is additive and is
-- intentionally not applied as part of this task.

ALTER TYPE "BookingStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "BookingStatus" ADD VALUE 'REJECTED';

ALTER TABLE "ExperienceBooking"
  ADD COLUMN "acceptedAt" TIMESTAMPTZ(3),
  ADD COLUMN "rejectedAt" TIMESTAMPTZ(3),
  ADD COLUMN "paymentExpiresAt" TIMESTAMPTZ(3);

CREATE TYPE "ExperiencePaymentProvider" AS ENUM ('SIMULATED', 'RAZORPAY');
CREATE TYPE "ExperiencePaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED');
CREATE TYPE "ExperiencePaymentVerification" AS ENUM ('SIMULATED', 'PROVIDER_VERIFIED');
CREATE TYPE "ExperienceRefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "ExperiencePaymentAttempt" (
  "id" TEXT NOT NULL,
  "experienceBookingId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "provider" "ExperiencePaymentProvider" NOT NULL DEFAULT 'SIMULATED',
  "providerReference" TEXT,
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "status" "ExperiencePaymentStatus" NOT NULL DEFAULT 'PENDING',
  "verificationMode" "ExperiencePaymentVerification",
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "succeededAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExperiencePaymentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExperiencePaymentAttempt_attemptNumber_check" CHECK ("attemptNumber" BETWEEN 1 AND 3),
  CONSTRAINT "ExperiencePaymentAttempt_amount_positive_check" CHECK ("amount" > 0),
  CONSTRAINT "ExperiencePaymentAttempt_success_audit_check"
    CHECK (("status" = 'SUCCEEDED') = ("succeededAt" IS NOT NULL AND "verificationMode" IS NOT NULL)),
  CONSTRAINT "ExperiencePaymentAttempt_verification_source_check"
    CHECK ("verificationMode" IS NULL
      OR ("provider" = 'SIMULATED' AND "verificationMode" = 'SIMULATED')
      OR ("provider" <> 'SIMULATED' AND "verificationMode" = 'PROVIDER_VERIFIED'))
);

CREATE TABLE "ExperiencePaymentEvent" (
  "id" TEXT NOT NULL,
  "paymentAttemptId" TEXT NOT NULL,
  "provider" "ExperiencePaymentProvider" NOT NULL,
  "providerEventKey" TEXT,
  "fromStatus" "ExperiencePaymentStatus",
  "toStatus" "ExperiencePaymentStatus" NOT NULL,
  "verificationMode" "ExperiencePaymentVerification",
  "reasonCode" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExperiencePaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExperienceRefund" (
  "id" TEXT NOT NULL,
  "paymentAttemptId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "provider" "ExperiencePaymentProvider" NOT NULL DEFAULT 'SIMULATED',
  "providerReference" TEXT,
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "status" "ExperienceRefundStatus" NOT NULL DEFAULT 'PENDING',
  "verificationMode" "ExperiencePaymentVerification",
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3),
  "lastAttemptAt" TIMESTAMPTZ(3),
  "succeededAt" TIMESTAMPTZ(3),
  "lastFailureCode" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExperienceRefund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExperienceRefund_amount_positive_check" CHECK ("amount" > 0),
  CONSTRAINT "ExperienceRefund_attemptCount_nonnegative_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "ExperienceRefund_success_audit_check"
    CHECK (("status" = 'SUCCEEDED') = ("succeededAt" IS NOT NULL AND "verificationMode" IS NOT NULL)),
  CONSTRAINT "ExperienceRefund_verification_source_check"
    CHECK ("verificationMode" IS NULL
      OR ("provider" = 'SIMULATED' AND "verificationMode" = 'SIMULATED')
      OR ("provider" <> 'SIMULATED' AND "verificationMode" = 'PROVIDER_VERIFIED'))
);

CREATE UNIQUE INDEX "ExperiencePaymentAttempt_reference_key"
  ON "ExperiencePaymentAttempt"("reference");
CREATE UNIQUE INDEX "ExperiencePaymentAttempt_providerReference_key"
  ON "ExperiencePaymentAttempt"("providerReference");
CREATE UNIQUE INDEX "ExperiencePaymentAttempt_experienceBookingId_attemptNumber_key"
  ON "ExperiencePaymentAttempt"("experienceBookingId", "attemptNumber");
CREATE UNIQUE INDEX "ExperiencePaymentAttempt_experienceBookingId_idempotencyKey_key"
  ON "ExperiencePaymentAttempt"("experienceBookingId", "idempotencyKey");
CREATE INDEX "ExperiencePaymentAttempt_experienceBookingId_createdAt_idx"
  ON "ExperiencePaymentAttempt"("experienceBookingId", "createdAt");
CREATE INDEX "ExperiencePaymentAttempt_status_expiresAt_idx"
  ON "ExperiencePaymentAttempt"("status", "expiresAt");

CREATE UNIQUE INDEX "ExperiencePaymentEvent_provider_providerEventKey_key"
  ON "ExperiencePaymentEvent"("provider", "providerEventKey");
CREATE INDEX "ExperiencePaymentEvent_paymentAttemptId_createdAt_idx"
  ON "ExperiencePaymentEvent"("paymentAttemptId", "createdAt");

CREATE UNIQUE INDEX "ExperienceRefund_paymentAttemptId_key"
  ON "ExperienceRefund"("paymentAttemptId");
CREATE UNIQUE INDEX "ExperienceRefund_idempotencyKey_key"
  ON "ExperienceRefund"("idempotencyKey");
CREATE UNIQUE INDEX "ExperienceRefund_providerReference_key"
  ON "ExperienceRefund"("providerReference");
CREATE INDEX "ExperienceRefund_status_nextAttemptAt_idx"
  ON "ExperienceRefund"("status", "nextAttemptAt");

ALTER TABLE "ExperiencePaymentAttempt"
  ADD CONSTRAINT "ExperiencePaymentAttempt_experienceBookingId_fkey"
  FOREIGN KEY ("experienceBookingId") REFERENCES "ExperienceBooking"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExperiencePaymentEvent"
  ADD CONSTRAINT "ExperiencePaymentEvent_paymentAttemptId_fkey"
  FOREIGN KEY ("paymentAttemptId") REFERENCES "ExperiencePaymentAttempt"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExperienceRefund"
  ADD CONSTRAINT "ExperienceRefund_paymentAttemptId_fkey"
  FOREIGN KEY ("paymentAttemptId") REFERENCES "ExperiencePaymentAttempt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
