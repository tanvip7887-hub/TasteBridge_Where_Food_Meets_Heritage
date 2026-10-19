-- Online payment checkout foundation. Additive: preserves existing checkouts,
-- orders, attempts, and cart rows. Apply only after its predecessor migrations.

BEGIN;

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'ONLINE';

CREATE TABLE "CheckoutLine" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "dishId" TEXT,
    "cookId" TEXT NOT NULL,
    "dishName" TEXT NOT NULL,
    "cookName" TEXT NOT NULL,
    "cuisine" TEXT NOT NULL,
    "dishImage" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" NUMERIC(14,2) NOT NULL,
    "totalPrice" NUMERIC(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckoutLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CheckoutLine_checkoutId_cookId_idx" ON "CheckoutLine"("checkoutId", "cookId");
CREATE INDEX "CheckoutLine_dishId_idx" ON "CheckoutLine"("dishId");

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "PaymentAttempt"
        WHERE "status" = 'PENDING'
        GROUP BY "checkoutId"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot enforce one pending payment attempt per checkout: duplicate pending attempts exist.';
    END IF;
END $$;

ALTER TABLE "CheckoutLine"
    ADD CONSTRAINT "CheckoutLine_checkoutId_fkey"
    FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CheckoutLine"
    ADD CONSTRAINT "CheckoutLine_dishId_fkey"
    FOREIGN KEY ("dishId") REFERENCES "Dish"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- The service also serializes initiation per customer at SERIALIZABLE isolation.
-- This index is the database-level guard against two pending attempts for one checkout.
CREATE UNIQUE INDEX "PaymentAttempt_one_pending_per_checkout_key"
    ON "PaymentAttempt"("checkoutId")
    WHERE "status" = 'PENDING';

COMMIT;
