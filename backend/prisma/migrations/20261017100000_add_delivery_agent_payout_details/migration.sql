BEGIN;

CREATE TABLE "DeliveryAgentPayoutDetails" (
    "id" TEXT NOT NULL,
    "deliveryAgentId" TEXT NOT NULL,
    "upiId" TEXT NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeliveryAgentPayoutDetails_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeliveryAgentPayoutDetails_deliveryAgentId_fkey" FOREIGN KEY ("deliveryAgentId") REFERENCES "DeliveryAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DeliveryAgentPayoutDetails_deliveryAgentId_key" ON "DeliveryAgentPayoutDetails"("deliveryAgentId");
CREATE INDEX "DeliveryAgentPayoutDetails_verificationStatus_submittedAt_idx" ON "DeliveryAgentPayoutDetails"("verificationStatus", "submittedAt");

COMMIT;
