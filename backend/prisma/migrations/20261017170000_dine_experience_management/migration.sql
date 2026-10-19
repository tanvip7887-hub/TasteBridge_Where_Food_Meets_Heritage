-- Extend the existing event model for Cook-managed HOME_DINING and WORKSHOP
-- experiences. Existing Experience and ExperienceBooking rows are preserved.

-- Keep the original enum labels and their relative order, then insert the new
-- lifecycle labels before the existing first value to match schema.prisma.
ALTER TYPE "ExperienceStatus" ADD VALUE 'DRAFT' BEFORE 'PENDING';
ALTER TYPE "ExperienceStatus" ADD VALUE 'PUBLISHED' BEFORE 'PENDING';
ALTER TYPE "ExperienceStatus" ADD VALUE 'PAUSED' BEFORE 'PENDING';

CREATE TYPE "ExperienceType" AS ENUM ('HOME_DINING', 'WORKSHOP');
CREATE TYPE "ExperienceAddressSource" AS ENUM ('COOK_PROFILE', 'CUSTOM');
CREATE TYPE "ExperienceSlotStatus" AS ENUM ('OPEN', 'PAUSED', 'CANCELLED');

ALTER TABLE "Experience"
  ADD COLUMN "type" "ExperienceType" NOT NULL DEFAULT 'HOME_DINING',
  ADD COLUMN "theme" VARCHAR(120),
  ADD COLUMN "isVegetarian" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "dietaryNotes" TEXT,
  ADD COLUMN "menuNotes" TEXT,
  ADD COLUMN "inclusions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "houseRules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "publicArea" VARCHAR(250),
  ADD COLUMN "privateAddress" TEXT,
  ADD COLUMN "addressSource" "ExperienceAddressSource";

-- Drafts may be saved before all publication details are complete. Existing
-- values are retained; only column nullability is relaxed for future drafts.
ALTER TABLE "Experience"
  ALTER COLUMN "description" DROP NOT NULL,
  ALTER COLUMN "cuisine" DROP NOT NULL,
  ALTER COLUMN "pricePerPerson" DROP NOT NULL,
  ALTER COLUMN "location" DROP NOT NULL;

CREATE TABLE "ExperienceMenuItem" (
  "experienceId" TEXT NOT NULL,
  "dishId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "note" VARCHAR(250),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExperienceMenuItem_pkey" PRIMARY KEY ("experienceId", "dishId")
);

CREATE UNIQUE INDEX "ExperienceMenuItem_experienceId_sortOrder_key"
  ON "ExperienceMenuItem"("experienceId", "sortOrder");
CREATE INDEX "ExperienceMenuItem_dishId_idx" ON "ExperienceMenuItem"("dishId");

ALTER TABLE "ExperienceMenuItem"
  ADD CONSTRAINT "ExperienceMenuItem_experienceId_fkey"
  FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExperienceMenuItem"
  ADD CONSTRAINT "ExperienceMenuItem_dishId_fkey"
  FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ExperienceSlot" (
  "id" TEXT NOT NULL,
  "experienceId" TEXT NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3) NOT NULL,
  "capacity" INTEGER NOT NULL,
  "availableSeats" INTEGER NOT NULL,
  "status" "ExperienceSlotStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExperienceSlot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExperienceSlot_capacity_check" CHECK ("capacity" > 0),
  CONSTRAINT "ExperienceSlot_availableSeats_check" CHECK ("availableSeats" >= 0 AND "availableSeats" <= "capacity"),
  CONSTRAINT "ExperienceSlot_time_order_check" CHECK ("endsAt" > "startsAt")
);

CREATE INDEX "ExperienceSlot_experienceId_startsAt_status_idx"
  ON "ExperienceSlot"("experienceId", "startsAt", "status");
ALTER TABLE "ExperienceSlot"
  ADD CONSTRAINT "ExperienceSlot_experienceId_fkey"
  FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExperienceBooking" ADD COLUMN "slotId" TEXT;
CREATE INDEX "ExperienceBooking_slotId_status_idx" ON "ExperienceBooking"("slotId", "status");
ALTER TABLE "ExperienceBooking"
  ADD CONSTRAINT "ExperienceBooking_slotId_fkey"
  FOREIGN KEY ("slotId") REFERENCES "ExperienceSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformSettings"
  ADD COLUMN "experienceCancellationWindowHours" INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN "experienceCookResponseWindowHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "experienceBookingCutoffHours" INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN "experiencePaymentHoldMinutes" INTEGER NOT NULL DEFAULT 15;
