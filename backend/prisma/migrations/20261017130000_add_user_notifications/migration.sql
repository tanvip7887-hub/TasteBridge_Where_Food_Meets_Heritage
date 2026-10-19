BEGIN;

CREATE TYPE "NotificationPortal" AS ENUM ('CUSTOMER', 'COOK', 'DELIVERY_AGENT');

CREATE TABLE "UserNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portal" "NotificationPortal" NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM_ALERT',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "eventKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserNotification_userId_portal_isRead_createdAt_idx" ON "UserNotification"("userId", "portal", "isRead", "createdAt");
CREATE UNIQUE INDEX "UserNotification_userId_portal_eventKey_key" ON "UserNotification"("userId", "portal", "eventKey");

COMMIT;
