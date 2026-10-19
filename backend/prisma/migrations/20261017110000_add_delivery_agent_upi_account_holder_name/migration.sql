BEGIN;

ALTER TABLE "DeliveryAgentPayoutDetails"
ADD COLUMN "accountHolderName" TEXT NOT NULL DEFAULT '';

ALTER TABLE "DeliveryAgentPayoutDetails"
ALTER COLUMN "accountHolderName" DROP DEFAULT;

COMMIT;
