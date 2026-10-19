-- Add nullable completedAt to ExperienceBooking to record authoritative event completion
ALTER TABLE "ExperienceBooking" ADD COLUMN "completedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ExperienceBooking_status_completedAt_idx" ON "ExperienceBooking"("status", "completedAt");
