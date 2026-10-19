CREATE TYPE "FssaiStatusType" AS ENUM (
  'HAVE_REGISTRATION',
  'APPLIED_ON_FOSCOS',
  'NOT_YET_REGISTERED'
);

ALTER TABLE "CookProfile"
  ADD COLUMN "fssaiStatusType" "FssaiStatusType",
  ADD COLUMN "fssaiExpiryDate" TIMESTAMP(3);

ALTER TABLE "CookProfile"
  ADD COLUMN "fssaiRejectionReason" TEXT;

CREATE TABLE "CookNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL DEFAULT 'VERIFICATION_ALERT',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CookNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CookNotification_userId_isRead_createdAt_idx"
  ON "CookNotification"("userId", "isRead", "createdAt");

ALTER TABLE "CookNotification"
  ADD CONSTRAINT "CookNotification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
