CREATE TYPE "SocialReportReason" AS ENUM ('INAPPROPRIATE_CONTENT', 'HARASSMENT', 'SPAM', 'MISLEADING_CONTENT', 'OTHER');
CREATE TYPE "SocialReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'DISMISSED', 'ACTION_TAKEN');
CREATE TYPE "SocialModerationActionType" AS ENUM ('MARK_REVIEWED', 'DISMISS_REPORT', 'HIDE_POST', 'HIDE_STORY', 'HIDE_COMMENT');

ALTER TABLE "CookStory" ADD COLUMN "moderationHiddenAt" TIMESTAMP(3);
ALTER TABLE "CookPost" ADD COLUMN "moderationHiddenAt" TIMESTAMP(3);
ALTER TABLE "CookPostComment" ADD COLUMN "moderationHiddenAt" TIMESTAMP(3);
CREATE INDEX "CookStory_moderationHiddenAt_expiresAt_idx" ON "CookStory"("moderationHiddenAt", "expiresAt");
CREATE INDEX "CookPost_moderationHiddenAt_publishedAt_idx" ON "CookPost"("moderationHiddenAt", "publishedAt");
CREATE INDEX "CookPostComment_moderationHiddenAt_idx" ON "CookPostComment"("moderationHiddenAt");

CREATE TABLE "SocialContentReport" (
  "id" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "postId" TEXT,
  "storyId" TEXT,
  "commentId" TEXT,
  "reason" "SocialReportReason" NOT NULL,
  "explanation" VARCHAR(500),
  "status" "SocialReportStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "SocialContentReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocialContentReport_targetType_check" CHECK ("targetType" IN ('POST', 'STORY', 'COMMENT')),
  CONSTRAINT "SocialContentReport_target_consistency_check" CHECK (
    ("postId" IS NULL AND "storyId" IS NULL AND "commentId" IS NULL)
    OR ("targetType" = 'POST' AND "postId" = "targetId" AND "storyId" IS NULL AND "commentId" IS NULL)
    OR ("targetType" = 'STORY' AND "storyId" = "targetId" AND "postId" IS NULL AND "commentId" IS NULL)
    OR ("targetType" = 'COMMENT' AND "commentId" = "targetId" AND "postId" IS NULL AND "storyId" IS NULL)
  )
);
CREATE TABLE "SocialModerationAction" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "action" "SocialModerationActionType" NOT NULL,
  "reason" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialModerationAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocialModerationAction_targetType_check" CHECK ("targetType" IN ('POST', 'STORY', 'COMMENT'))
);
CREATE INDEX "SocialContentReport_status_createdAt_idx" ON "SocialContentReport"("status", "createdAt");
CREATE INDEX "SocialContentReport_targetType_targetId_idx" ON "SocialContentReport"("targetType", "targetId");
CREATE INDEX "SocialContentReport_reporterId_createdAt_idx" ON "SocialContentReport"("reporterId", "createdAt");
CREATE INDEX "SocialContentReport_postId_idx" ON "SocialContentReport"("postId");
CREATE INDEX "SocialContentReport_storyId_idx" ON "SocialContentReport"("storyId");
CREATE INDEX "SocialContentReport_commentId_idx" ON "SocialContentReport"("commentId");
CREATE UNIQUE INDEX "SocialContentReport_pending_reporter_target_key" ON "SocialContentReport"("reporterId", "targetType", "targetId") WHERE "status" = 'PENDING';
CREATE INDEX "SocialModerationAction_reportId_createdAt_idx" ON "SocialModerationAction"("reportId", "createdAt");
CREATE INDEX "SocialModerationAction_targetType_targetId_createdAt_idx" ON "SocialModerationAction"("targetType", "targetId", "createdAt");
CREATE INDEX "SocialModerationAction_adminUserId_createdAt_idx" ON "SocialModerationAction"("adminUserId", "createdAt");
ALTER TABLE "SocialContentReport" ADD CONSTRAINT "SocialContentReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SocialContentReport" ADD CONSTRAINT "SocialContentReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CookPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SocialContentReport" ADD CONSTRAINT "SocialContentReport_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "CookStory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SocialContentReport" ADD CONSTRAINT "SocialContentReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CookPostComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SocialModerationAction" ADD CONSTRAINT "SocialModerationAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SocialContentReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SocialModerationAction" ADD CONSTRAINT "SocialModerationAction_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
