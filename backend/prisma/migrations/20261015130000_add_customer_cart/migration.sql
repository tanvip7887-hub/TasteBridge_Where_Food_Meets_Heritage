CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CartItem_quantity_check" CHECK ("quantity" >= 1)
);

CREATE UNIQUE INDEX "Cart_customerId_key" ON "Cart"("customerId");
CREATE UNIQUE INDEX "CartItem_cartId_dishId_key" ON "CartItem"("cartId", "dishId");
CREATE INDEX "CartItem_cartId_idx" ON "CartItem"("cartId");

ALTER TABLE "Cart"
    ADD CONSTRAINT "Cart_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CartItem"
    ADD CONSTRAINT "CartItem_cartId_fkey"
    FOREIGN KEY ("cartId") REFERENCES "Cart"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CartItem"
    ADD CONSTRAINT "CartItem_dishId_fkey"
    FOREIGN KEY ("dishId") REFERENCES "Dish"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
