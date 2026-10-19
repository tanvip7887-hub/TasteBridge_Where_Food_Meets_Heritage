-- A checkout groups the cook-specific orders created from one multi-cook cart.
CREATE TABLE "Checkout" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "addressId" TEXT,
    "addressSnapshot" JSONB NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "deliveryFee" DOUBLE PRECISION NOT NULL,
    "platformFee" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Checkout_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order"
    ADD COLUMN "checkoutId" TEXT,
    ADD COLUMN "cookName" TEXT NOT NULL DEFAULT '';

-- Preserve the cook name for existing orders without changing any other data.
UPDATE "Order" AS o
SET "cookName" = cp."businessName"
FROM "CookProfile" AS cp
WHERE o."cookId" = cp."id";

CREATE UNIQUE INDEX "Checkout_customerId_idempotencyKey_key"
    ON "Checkout"("customerId", "idempotencyKey");
CREATE INDEX "Checkout_customerId_createdAt_idx"
    ON "Checkout"("customerId", "createdAt");
CREATE INDEX "Order_checkoutId_idx" ON "Order"("checkoutId");

ALTER TABLE "Checkout"
    ADD CONSTRAINT "Checkout_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Checkout"
    ADD CONSTRAINT "Checkout_addressId_fkey"
    FOREIGN KEY ("addressId") REFERENCES "Address"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order"
    ADD CONSTRAINT "Order_checkoutId_fkey"
    FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
