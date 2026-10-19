-- Keep legacy addresses readable; new API writes require these fields.
ALTER TABLE "Address"
    ADD COLUMN "recipientName" TEXT,
    ADD COLUMN "phone" TEXT,
    ADD COLUMN "locality" TEXT;
