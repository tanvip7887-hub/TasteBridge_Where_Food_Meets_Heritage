CREATE TABLE "CookPostLike" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CookPostLike_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CookPostComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "text" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CookPostComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CookPostLike_userId_postId_key" ON "CookPostLike"("userId", "postId");
CREATE INDEX "CookPostLike_postId_createdAt_idx" ON "CookPostLike"("postId", "createdAt");

CREATE UNIQUE INDEX "CookPostComment_id_postId_key" ON "CookPostComment"("id", "postId");
CREATE INDEX "CookPostComment_postId_deletedAt_createdAt_idx" ON "CookPostComment"("postId", "deletedAt", "createdAt");
CREATE INDEX "CookPostComment_authorId_createdAt_idx" ON "CookPostComment"("authorId", "createdAt");
CREATE INDEX "CookPostComment_parentId_idx" ON "CookPostComment"("parentId");

ALTER TABLE "CookPostLike" ADD CONSTRAINT "CookPostLike_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "CookPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CookPostLike" ADD CONSTRAINT "CookPostLike_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CookPostComment" ADD CONSTRAINT "CookPostComment_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "CookPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CookPostComment" ADD CONSTRAINT "CookPostComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CookPostComment" ADD CONSTRAINT "CookPostComment_parentId_postId_fkey"
  FOREIGN KEY ("parentId", "postId") REFERENCES "CookPostComment"("id", "postId") ON DELETE CASCADE ON UPDATE CASCADE;
