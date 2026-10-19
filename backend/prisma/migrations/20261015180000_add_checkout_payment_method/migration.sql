CREATE TYPE "PaymentMethod" AS ENUM ('COD');

-- Nullable preserves the unknown method for checkouts placed before COD selection existed.
ALTER TABLE "Checkout" ADD COLUMN "paymentMethod" "PaymentMethod";
