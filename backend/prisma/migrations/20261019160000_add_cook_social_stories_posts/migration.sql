CREATE TYPE "SocialMediaType" AS ENUM ('IMAGE', 'VIDEO');
CREATE TYPE "SocialPostType" AS ENUM ('PHOTO', 'VIDEO', 'RECIPE', 'HERITAGE_STORY');
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "CookStory" (
    "id" TEXT NOT NULL,
    "cookId" TEXT NOT NULL,
    "dishId" TEXT,
    "caption" TEXT,
    "mediaType" "SocialMediaType" NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "cloudinaryPublicId" TEXT NOT NULL,
    "cloudinaryResourceType" TEXT NOT NULL,
    "mediaFormat" TEXT,
    "mediaMimeType" TEXT NOT NULL,
    "mediaBytes" INTEGER NOT NULL,
    "mediaDurationSeconds" DOUBLE PRECISION,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CookStory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CookPost" (
    "id" TEXT NOT NULL,
    "cookId" TEXT NOT NULL,
    "dishId" TEXT,
    "postType" "SocialPostType" NOT NULL,
    "caption" TEXT,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "CookPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CookPostMedia" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "mediaType" "SocialMediaType" NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "cloudinaryPublicId" TEXT NOT NULL,
    "cloudinaryResourceType" TEXT NOT NULL,
    "mediaFormat" TEXT,
    "mediaMimeType" TEXT NOT NULL,
    "mediaBytes" INTEGER NOT NULL,
    "mediaDurationSeconds" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CookPostMedia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CookStory_cloudinaryPublicId_key" ON "CookStory"("cloudinaryPublicId");
CREATE INDEX "CookStory_cookId_expiresAt_idx" ON "CookStory"("cookId", "expiresAt");
CREATE INDEX "CookStory_dishId_idx" ON "CookStory"("dishId");

CREATE INDEX "CookPost_cookId_status_updatedAt_idx" ON "CookPost"("cookId", "status", "updatedAt");
CREATE INDEX "CookPost_dishId_idx" ON "CookPost"("dishId");

CREATE UNIQUE INDEX "CookPostMedia_cloudinaryPublicId_key" ON "CookPostMedia"("cloudinaryPublicId");
CREATE INDEX "CookPostMedia_postId_sortOrder_idx" ON "CookPostMedia"("postId", "sortOrder");

ALTER TABLE "CookStory" ADD CONSTRAINT "CookStory_cookId_fkey"
  FOREIGN KEY ("cookId") REFERENCES "CookProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CookStory" ADD CONSTRAINT "CookStory_dishId_fkey"
  FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CookPost" ADD CONSTRAINT "CookPost_cookId_fkey"
  FOREIGN KEY ("cookId") REFERENCES "CookProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CookPost" ADD CONSTRAINT "CookPost_dishId_fkey"
  FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CookPostMedia" ADD CONSTRAINT "CookPostMedia_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "CookPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
