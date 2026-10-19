-- Add the verified food and experience review workflow without rewriting
-- existing Review rows or removing legacy moderation data.
CREATE TYPE "ReviewType" AS ENUM ('FOOD', 'EXPERIENCE');
CREATE TYPE "ReviewReportStatus" AS ENUM ('ACTIVE', 'KEPT', 'HIDDEN');
CREATE TYPE "ReviewModerationAction" AS ENUM ('KEPT', 'HIDDEN', 'REMOVED');

ALTER TABLE "Review"
  ADD COLUMN "reviewType" "ReviewType" NOT NULL DEFAULT 'FOOD',
  ADD COLUMN "orderItemId" TEXT,
  ADD COLUMN "experienceBookingId" TEXT,
  ADD COLUMN "subjectNameSnapshot" TEXT,
  ADD COLUMN "cookNameSnapshot" TEXT,
  ADD COLUMN "cookReply" VARCHAR(300),
  ADD COLUMN "cookRepliedAt" TIMESTAMP(3),
  ADD COLUMN "reportedAt" TIMESTAMP(3),
  ADD COLUMN "moderationReason" TEXT,
  ADD COLUMN "moderatedAt" TIMESTAMP(3),
  ALTER COLUMN "comment" DROP NOT NULL;

CREATE UNIQUE INDEX "Review_orderItemId_key" ON "Review"("orderItemId");
CREATE UNIQUE INDEX "Review_experienceBookingId_key" ON "Review"("experienceBookingId");
CREATE INDEX "Review_reviewType_status_createdAt_idx" ON "Review"("reviewType", "status", "createdAt");
CREATE INDEX "Review_dishId_status_createdAt_idx" ON "Review"("dishId", "status", "createdAt");

ALTER TABLE "Review" ADD CONSTRAINT "Review_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_experienceBookingId_fkey"
  FOREIGN KEY ("experienceBookingId") REFERENCES "ExperienceBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReviewReport" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "cookId" TEXT NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "status" "ReviewReportStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByAdminId" TEXT,
  CONSTRAINT "ReviewReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReviewReport_reviewId_key" ON "ReviewReport"("reviewId");
CREATE INDEX "ReviewReport_status_createdAt_idx" ON "ReviewReport"("status", "createdAt");
CREATE INDEX "ReviewReport_cookId_createdAt_idx" ON "ReviewReport"("cookId", "createdAt");
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_cookId_fkey"
  FOREIGN KEY ("cookId") REFERENCES "CookProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_resolvedByAdminId_fkey"
  FOREIGN KEY ("resolvedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ReviewModerationLog" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "action" "ReviewModerationAction" NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewModerationLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReviewModerationLog_reviewId_createdAt_idx" ON "ReviewModerationLog"("reviewId", "createdAt");
CREATE INDEX "ReviewModerationLog_adminUserId_createdAt_idx" ON "ReviewModerationLog"("adminUserId", "createdAt");
ALTER TABLE "ReviewModerationLog" ADD CONSTRAINT "ReviewModerationLog_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewModerationLog" ADD CONSTRAINT "ReviewModerationLog_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformNotification" ADD COLUMN "eventKey" TEXT;
CREATE UNIQUE INDEX "PlatformNotification_eventKey_key" ON "PlatformNotification"("eventKey");
