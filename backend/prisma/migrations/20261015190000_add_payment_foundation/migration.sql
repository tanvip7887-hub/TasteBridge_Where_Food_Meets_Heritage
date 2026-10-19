CREATE TYPE "PaymentAttemptMethod" AS ENUM ('SIMULATED');
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'REFUNDED');

CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "method" "PaymentAttemptMethod" NOT NULL DEFAULT 'SIMULATED',
    "methodLabel" TEXT NOT NULL DEFAULT 'TasteBridge simulated payment',
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentAttemptEvent" (
    "id" TEXT NOT NULL,
    "paymentAttemptId" TEXT NOT NULL,
    "fromStatus" "PaymentAttemptStatus",
    "toStatus" "PaymentAttemptStatus" NOT NULL,
    "reasonCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAttemptEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentAttempt_reference_key" ON "PaymentAttempt"("reference");
CREATE INDEX "PaymentAttempt_checkoutId_createdAt_idx" ON "PaymentAttempt"("checkoutId", "createdAt");
CREATE INDEX "PaymentAttempt_status_expiresAt_idx" ON "PaymentAttempt"("status", "expiresAt");
CREATE INDEX "PaymentAttemptEvent_paymentAttemptId_createdAt_idx" ON "PaymentAttemptEvent"("paymentAttemptId", "createdAt");

ALTER TABLE "PaymentAttempt"
    ADD CONSTRAINT "PaymentAttempt_checkoutId_fkey"
    FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentAttemptEvent"
    ADD CONSTRAINT "PaymentAttemptEvent_paymentAttemptId_fkey"
    FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
