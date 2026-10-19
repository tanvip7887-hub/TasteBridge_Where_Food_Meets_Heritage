ALTER TABLE "CookPostComment"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestFingerprint" TEXT;

CREATE UNIQUE INDEX "CookPostComment_authorId_idempotencyKey_key"
  ON "CookPostComment"("authorId", "idempotencyKey");
