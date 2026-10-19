-- CreateEnum
CREATE TYPE "DishStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'UNPUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StoryVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'ARCHIVE_ONLY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExperienceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('VERIFICATION_ALERT', 'PAYMENT_ALERT', 'ORDER_ALERT', 'SYSTEM_ALERT');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'ADDRESS_PROOF';

-- AlterTable
ALTER TABLE "CookProfile" ADD COLUMN     "availableDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "availableMealSlots" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "city" TEXT,
ADD COLUMN     "cookingCapacity" TEXT,
ADD COLUMN     "cuisines" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "dietaryPreferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "experienceYears" TEXT,
ADD COLUMN     "foodSafetyAgreementVersion" TEXT DEFAULT 'v1.0',
ADD COLUMN     "foodSafetyConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "foodSafetyConsentAt" TIMESTAMP(3),
ADD COLUMN     "fssaiNumber" TEXT,
ADD COLUMN     "fssaiStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "isApprovedToSell" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isHomeKitchenDeclared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isOpen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "locality" TEXT,
ADD COLUMN     "prepTimeNotice" TEXT,
ADD COLUMN     "profileImage" TEXT,
ADD COLUMN     "profileImagePublicId" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "revisionReason" TEXT,
ADD COLUMN     "serviceArea" TEXT,
ADD COLUMN     "signatureDishes" TEXT,
ADD COLUMN     "whoTaughtCooking" TEXT;

-- AlterTable
ALTER TABLE "VerificationDocument" ADD COLUMN     "cloudinaryPublicId" TEXT,
ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "resourceType" TEXT,
ADD COLUMN     "storageProvider" TEXT DEFAULT 'CLOUDINARY';

-- CreateTable
CREATE TABLE "FoodCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dish" (
    "id" TEXT NOT NULL,
    "cookId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cuisine" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "image" TEXT,
    "imagePublicId" TEXT,
    "isVegetarian" BOOLEAN NOT NULL DEFAULT true,
    "ingredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "instructions" TEXT,
    "prepTimeMinutes" INTEGER DEFAULT 30,
    "dietaryTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "availableQuantity" INTEGER NOT NULL DEFAULT 10,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 3,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "status" "DishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishStory" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "whoTaught" TEXT NOT NULL,
    "occasion" TEXT,
    "culturalSignificance" TEXT,
    "storyText" TEXT NOT NULL,
    "visibility" "StoryVisibility" NOT NULL DEFAULT 'PUBLIC',
    "mediaUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DishStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "cookId" TEXT NOT NULL,
    "deliveryAgentId" TEXT,
    "addressId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PAID',
    "subtotal" DOUBLE PRECISION NOT NULL,
    "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 30.0,
    "platformFee" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "cookEarning" DOUBLE PRECISION NOT NULL,
    "deliveryEarning" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "dishId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experience" (
    "id" TEXT NOT NULL,
    "cookId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cuisine" TEXT NOT NULL,
    "pricePerPerson" DOUBLE PRECISION NOT NULL,
    "maxGuests" INTEGER NOT NULL DEFAULT 6,
    "durationMinutes" INTEGER NOT NULL DEFAULT 120,
    "location" TEXT NOT NULL,
    "image" TEXT,
    "status" "ExperienceStatus" NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceBooking" (
    "id" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "bookingDate" TIMESTAMP(3) NOT NULL,
    "numberOfGuests" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperienceBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "customerId" TEXT NOT NULL,
    "cookId" TEXT NOT NULL,
    "dishId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "isReported" BOOLEAN NOT NULL DEFAULT false,
    "reportReason" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformNotification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM_ALERT',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "resetTokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "resendAllowedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FoodCategory_name_key" ON "FoodCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FoodCategory_slug_key" ON "FoodCategory"("slug");

-- CreateIndex
CREATE INDEX "Dish_cookId_idx" ON "Dish"("cookId");

-- CreateIndex
CREATE INDEX "Dish_cuisine_idx" ON "Dish"("cuisine");

-- CreateIndex
CREATE INDEX "Dish_status_idx" ON "Dish"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DishStory_dishId_key" ON "DishStory"("dishId");

-- CreateIndex
CREATE INDEX "DishStory_dishId_idx" ON "DishStory"("dishId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_cookId_idx" ON "Order"("cookId");

-- CreateIndex
CREATE INDEX "Order_deliveryAgentId_idx" ON "Order"("deliveryAgentId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "Experience_cookId_idx" ON "Experience"("cookId");

-- CreateIndex
CREATE INDEX "Experience_status_idx" ON "Experience"("status");

-- CreateIndex
CREATE INDEX "ExperienceBooking_experienceId_idx" ON "ExperienceBooking"("experienceId");

-- CreateIndex
CREATE INDEX "ExperienceBooking_customerId_idx" ON "ExperienceBooking"("customerId");

-- CreateIndex
CREATE INDEX "Review_cookId_idx" ON "Review"("cookId");

-- CreateIndex
CREATE INDEX "Review_customerId_idx" ON "Review"("customerId");

-- CreateIndex
CREATE INDEX "Review_isReported_idx" ON "Review"("isReported");

-- CreateIndex
CREATE INDEX "PlatformNotification_type_idx" ON "PlatformNotification"("type");

-- CreateIndex
CREATE INDEX "PlatformNotification_isRead_idx" ON "PlatformNotification"("isRead");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_email_key" ON "PasswordResetToken"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_resetTokenHash_key" ON "PasswordResetToken"("resetTokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_email_idx" ON "PasswordResetToken"("email");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "VerificationDocument_cloudinaryPublicId_idx" ON "VerificationDocument"("cloudinaryPublicId");

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_cookId_fkey" FOREIGN KEY ("cookId") REFERENCES "CookProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FoodCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishStory" ADD CONSTRAINT "DishStory_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cookId_fkey" FOREIGN KEY ("cookId") REFERENCES "CookProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryAgentId_fkey" FOREIGN KEY ("deliveryAgentId") REFERENCES "DeliveryAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_cookId_fkey" FOREIGN KEY ("cookId") REFERENCES "CookProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceBooking" ADD CONSTRAINT "ExperienceBooking_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceBooking" ADD CONSTRAINT "ExperienceBooking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_cookId_fkey" FOREIGN KEY ("cookId") REFERENCES "CookProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
