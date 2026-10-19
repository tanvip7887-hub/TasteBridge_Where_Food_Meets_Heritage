ALTER TABLE "Experience"
  ADD COLUMN "publishIdempotencyKey" VARCHAR(128),
  ADD COLUMN "publishRequestFingerprint" VARCHAR(64);

CREATE UNIQUE INDEX "Experience_cookId_publishIdempotencyKey_key"
  ON "Experience"("cookId", "publishIdempotencyKey");