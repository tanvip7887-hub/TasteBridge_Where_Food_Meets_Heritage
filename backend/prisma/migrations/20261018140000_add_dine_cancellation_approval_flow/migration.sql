-- AlterTable
ALTER TABLE "ExperienceBooking"
  ADD COLUMN "cancellationRequestedAt" TIMESTAMPTZ(3),
  ADD COLUMN "cancellationReason" VARCHAR(500),
  ADD COLUMN "cancellationStatus" VARCHAR(30),
  ADD COLUMN "cancellationDecisionReason" VARCHAR(500),
  ADD COLUMN "cancellationDecidedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "ExperienceBooking_cancellationStatus_idx" ON "ExperienceBooking"("cancellationStatus");
