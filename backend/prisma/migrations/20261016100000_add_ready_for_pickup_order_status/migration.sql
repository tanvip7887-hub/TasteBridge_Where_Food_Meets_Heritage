-- Add the cook handoff state without changing existing order statuses.
BEGIN;

ALTER TYPE "OrderStatus" ADD VALUE 'READY_FOR_PICKUP' AFTER 'PREPARING';

COMMIT;
