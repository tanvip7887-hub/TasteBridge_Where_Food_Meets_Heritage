CREATE TYPE "DeliveryOtpEmailStatus" AS ENUM ('PENDING', 'QUEUED', 'SMTP_ACCEPTED', 'FAILED');

CREATE TABLE "DeliveryCompletionOtp" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "deliveryAgentId" TEXT NOT NULL,
  "otpHash" TEXT NOT NULL,
  "generationId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "resendAllowedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "emailStatus" "DeliveryOtpEmailStatus" NOT NULL DEFAULT 'PENDING',
  "emailSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeliveryCompletionOtp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryCompletionOtp_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeliveryCompletionOtp_deliveryAgentId_fkey" FOREIGN KEY ("deliveryAgentId") REFERENCES "DeliveryAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DeliveryCompletionOtp_orderId_key" ON "DeliveryCompletionOtp"("orderId");
CREATE INDEX "DeliveryCompletionOtp_deliveryAgentId_expiresAt_idx" ON "DeliveryCompletionOtp"("deliveryAgentId", "expiresAt");
CREATE INDEX "DeliveryCompletionOtp_emailStatus_updatedAt_idx" ON "DeliveryCompletionOtp"("emailStatus", "updatedAt");
