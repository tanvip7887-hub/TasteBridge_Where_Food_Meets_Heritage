BEGIN;

CREATE TABLE "CustomerFavorite" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerFavorite_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CustomerFavorite_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerFavorite_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CustomerFavorite_customerId_dishId_key" ON "CustomerFavorite"("customerId", "dishId");
CREATE INDEX "CustomerFavorite_dishId_idx" ON "CustomerFavorite"("dishId");

COMMIT;
