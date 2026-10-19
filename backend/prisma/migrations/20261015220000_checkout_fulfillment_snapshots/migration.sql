-- Extend pending checkout snapshots for safe fulfillment and cart reconciliation.
-- Existing rows are retained. Legacy checkout lines without cart-row versions
-- cannot be safely fulfilled automatically and will fail closed in the service.

BEGIN;

ALTER TABLE "CheckoutLine"
    ADD COLUMN "cartItemId" TEXT,
    ADD COLUMN "cartItemUpdatedAt" TIMESTAMP(3);

CREATE TABLE "CheckoutCookSnapshot" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "cookId" TEXT NOT NULL,
    "cookName" TEXT NOT NULL,
    "subtotal" NUMERIC(14,2) NOT NULL,
    "deliveryFee" NUMERIC(14,2) NOT NULL,
    "platformFee" NUMERIC(14,2) NOT NULL,
    "totalAmount" NUMERIC(14,2) NOT NULL,
    "cookEarning" NUMERIC(14,2) NOT NULL,
    "deliveryEarning" NUMERIC(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckoutCookSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CheckoutCookSnapshot_checkoutId_cookId_key"
    ON "CheckoutCookSnapshot"("checkoutId", "cookId");

ALTER TABLE "CheckoutCookSnapshot"
    ADD CONSTRAINT "CheckoutCookSnapshot_checkoutId_fkey"
    FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
