import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";
import { createPostInteractionsService } from "../modules/cook/post-interactions.service.js";
import { createCookSocialContentService } from "../modules/cook/social-content.service.js";
import { createPublicSocialContentService } from "../modules/cook/public-social-content.service.js";
import { createSocialReportingService } from "../modules/cook/social-reporting.service.js";
import { createNotificationsService } from "../modules/notifications/notifications.service.js";

const testUrl = process.env.SOCIAL_TEST_DATABASE_URL;
const hasIsolatedUrl = Boolean(testUrl);

export const assertSafeTestTarget = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("SOCIAL_TEST_DATABASE_URL must be configured.");
  }
  const parsed = new URL(rawUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  assert.ok(
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname),
    `Social integration tests require a local PostgreSQL host. Host: ${parsed.hostname}`,
  );
  assert.match(
    databaseName,
    /^tastebridge_social_test_[a-z0-9_]+$/i,
    "Use a dedicated database named tastebridge_social_test_<suffix>; the configured tastebridge database is forbidden.",
  );
  assert.notEqual(databaseName.toLowerCase(), "tastebridge", "Targeting the live tastebridge database is strictly forbidden.");
  return databaseName;
};

// Test guard rejection of live database and non-local hosts unconditionally
test("assertSafeTestTarget rejects development database 'tastebridge' and non-local hosts", () => {
  assert.throws(
    () => assertSafeTestTarget("postgresql://postgres:secret@localhost:5432/tastebridge"),
    /forbidden/i,
  );
  assert.throws(
    () => assertSafeTestTarget("postgresql://postgres:secret@127.0.0.1:5432/tastebridge"),
    /forbidden/i,
  );
  assert.throws(
    () => assertSafeTestTarget("postgresql://postgres:secret@db.production.internal:5432/tastebridge_social_test_01"),
    /local/i,
  );
  assert.throws(
    () => assertSafeTestTarget("postgresql://postgres:secret@localhost:5432/other_db"),
    /dedicated database named tastebridge_social_test_/i,
  );
  const validDb = assertSafeTestTarget("postgresql://postgres:secret@localhost:5432/tastebridge_social_test_01");
  assert.equal(validDb, "tastebridge_social_test_01");
});

test("PostgreSQL Social Stories & Posts Integration Suite", { skip: !hasIsolatedUrl }, async (suite) => {
  const targetDatabaseName = assertSafeTestTarget(testUrl);
  const pool = new pg.Pool({ connectionString: testUrl, max: 10 });
  const database = new PrismaClient({ adapter: new PrismaPg(pool) });

  const ownedUserIds = new Set();
  const ownedCookProfileIds = new Set();
  const ownedDishIds = new Set();
  const ownedPostIds = new Set();
  const ownedStoryIds = new Set();
  const ownedCommentIds = new Set();
  const ownedReportIds = new Set();
  const ownedActionIds = new Set();
  const ownedNotificationIds = new Set();

  const mockStorage = {
    uploadPublicMarketplaceImage: async () => ({ publicId: `mock-img-${randomUUID()}`, secureUrl: "https://example.invalid/img.jpg" }),
    uploadPublicSocialVideo: async () => ({ publicId: `mock-vid-${randomUUID()}`, secureUrl: "https://example.invalid/vid.mp4", duration: 15 }),
    deleteCloudinaryAsset: async () => ({ result: "ok" }),
  };

  const postInteractionsService = createPostInteractionsService(database);
  const cookSocialContentService = createCookSocialContentService(database, { storage: mockStorage });
  const publicSocialContentService = createPublicSocialContentService(database);
  const socialReportingService = createSocialReportingService(database);
  const notificationsService = createNotificationsService(database);

  const cleanupRecords = async () => {
    if (ownedActionIds.size > 0) {
      await database.socialModerationAction.deleteMany({ where: { id: { in: Array.from(ownedActionIds) } } });
      ownedActionIds.clear();
    }
    if (ownedReportIds.size > 0) {
      await database.socialContentReport.deleteMany({ where: { id: { in: Array.from(ownedReportIds) } } });
      ownedReportIds.clear();
    }
    if (ownedNotificationIds.size > 0 || ownedUserIds.size > 0) {
      await database.userNotification.deleteMany({
        where: {
          OR: [
            { id: { in: Array.from(ownedNotificationIds) } },
            { userId: { in: Array.from(ownedUserIds) } },
          ],
        },
      });
      ownedNotificationIds.clear();
    }
    if (ownedPostIds.size > 0 || ownedUserIds.size > 0) {
      await database.cookPostLike.deleteMany({
        where: {
          OR: [
            { postId: { in: Array.from(ownedPostIds) } },
            { userId: { in: Array.from(ownedUserIds) } },
          ],
        },
      });
    }
    if (ownedPostIds.size > 0 || ownedUserIds.size > 0 || ownedCommentIds.size > 0) {
      await database.cookPostComment.deleteMany({
        where: {
          OR: [
            { id: { in: Array.from(ownedCommentIds) } },
            { postId: { in: Array.from(ownedPostIds) } },
            { authorId: { in: Array.from(ownedUserIds) } },
          ],
        },
      });
      ownedCommentIds.clear();
    }
    if (ownedPostIds.size > 0) {
      await database.cookPostMedia.deleteMany({ where: { postId: { in: Array.from(ownedPostIds) } } });
      await database.cookPost.deleteMany({ where: { id: { in: Array.from(ownedPostIds) } } });
      ownedPostIds.clear();
    }
    if (ownedStoryIds.size > 0) {
      await database.cookStory.deleteMany({ where: { id: { in: Array.from(ownedStoryIds) } } });
      ownedStoryIds.clear();
    }
    if (ownedDishIds.size > 0) {
      await database.dish.deleteMany({ where: { id: { in: Array.from(ownedDishIds) } } });
      ownedDishIds.clear();
    }
    if (ownedCookProfileIds.size > 0) {
      await database.cookProfile.deleteMany({ where: { id: { in: Array.from(ownedCookProfileIds) } } });
      ownedCookProfileIds.clear();
    }
    if (ownedUserIds.size > 0) {
      await database.user.deleteMany({ where: { id: { in: Array.from(ownedUserIds) } } });
      ownedUserIds.clear();
    }
  };

  suite.after(async () => {
    try {
      await cleanupRecords();
    } finally {
      await database.$disconnect();
      await pool.end();
    }
  });

  const createEligibleCookFixture = async () => {
    const marker = randomUUID();
    const cookUser = await database.user.create({
      data: {
        name: `Social Cook ${marker}`,
        email: `social-cook-${marker}@example.invalid`,
        passwordHash: "integration-test-only",
        role: "COOK",
        status: "ACTIVE",
        cookProfile: {
          create: {
            businessName: `Test Kitchen ${marker.slice(0, 8)}`,
            profileImage: "https://example.invalid/cook.jpg",
            bio: "A verified home kitchen serving authentic heritage recipes.",
            experienceYears: "5 years",
            specialization: "Indian Heritage",
            city: "Pune",
            locality: "Kothrud",
            cookingCapacity: "20 meals",
            prepTimeNotice: "2 hours",
            cuisines: ["Maharashtrian"],
            dietaryPreferences: ["VEGETARIAN"],
            availableDays: ["MONDAY", "TUESDAY", "WEDNESDAY"],
            availableMealSlots: ["LUNCH", "DINNER"],
            isHomeKitchenDeclared: true,
            foodSafetyConsent: true,
            verificationStatus: "APPROVED",
            isApprovedToSell: true,
            fssaiStatus: "APPROVED",
            fssaiExpiryDate: new Date("2035-01-01T00:00:00.000Z"),
          },
        },
      },
      include: { cookProfile: true },
    });
    ownedUserIds.add(cookUser.id);
    ownedCookProfileIds.add(cookUser.cookProfile.id);
    return cookUser;
  };

  const createCustomerFixture = async () => {
    const marker = randomUUID();
    const customer = await database.user.create({
      data: {
        name: `Social Customer ${marker.slice(0, 8)}`,
        email: `social-cust-${marker}@example.invalid`,
        passwordHash: "integration-test-only",
        role: "CUSTOMER",
        status: "ACTIVE",
      },
    });
    ownedUserIds.add(customer.id);
    return customer;
  };

  const createAdminFixture = async () => {
    const marker = randomUUID();
    const admin = await database.user.create({
      data: {
        name: `Social Admin ${marker.slice(0, 8)}`,
        email: `social-admin-${marker}@example.invalid`,
        passwordHash: "integration-test-only",
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    ownedUserIds.add(admin.id);
    return admin;
  };

  const createPublishedPostFixture = async (cookId) => {
    const marker = randomUUID();
    const post = await database.cookPost.create({
      data: {
        cookId,
        postType: "PHOTO",
        caption: `Heritage culinary post ${marker}`,
        status: "PUBLISHED",
        publishedAt: new Date(),
        media: {
          create: [
            {
              mediaType: "IMAGE",
              mediaUrl: "https://example.invalid/post1.jpg",
              cloudinaryPublicId: `social-post-img-${marker}`,
              cloudinaryResourceType: "image",
              sortOrder: 0,
              mediaMimeType: "image/jpeg",
              mediaBytes: 1024,
            },
          ],
        },
      },
      include: { media: true },
    });
    ownedPostIds.add(post.id);
    return post;
  };

  // =========================================================================
  // Test 1: Concurrent identical comment submissions with the same idempotency key
  // =========================================================================
  await suite.test("1. Concurrent identical comment submissions with the same idempotency key resolve idempotently without duplicates", async () => {
    const cook = await createEligibleCookFixture();
    const customer = await createCustomerFixture();
    const post = await createPublishedPostFixture(cook.cookProfile.id);

    const customerActor = {
      id: customer.id,
      role: "CUSTOMER",
      activePortal: "CUSTOMER",
      status: "ACTIVE",
    };

    // Valid idempotency key format: 16-128 chars, alphanumeric + ._:-
    const idempotencyKey = `idemp-key-${randomUUID().replace(/-/g, "")}`;
    const commentPayload = { text: "What a stunning heritage dish!" };

    // Fire 2 concurrent submissions with the exact same idempotency key
    const [res1, res2] = await Promise.all([
      postInteractionsService.createComment(customerActor, post.id, commentPayload, idempotencyKey),
      postInteractionsService.createComment(customerActor, post.id, commentPayload, idempotencyKey),
    ]);

    // Both promises must succeed and return the exact same comment ID
    assert.ok(res1?.id, "First concurrent response must have an id");
    assert.ok(res2?.id, "Second concurrent response must have an id");
    assert.equal(res1.id, res2.id, "Both concurrent submissions must return the same comment ID");
    assert.equal(res1.postId, post.id);
    assert.equal(res2.postId, post.id);

    ownedCommentIds.add(res1.id);

    // Direct PostgreSQL inspection: only 1 comment row must exist in CookPostComment
    const commentsInDb = await database.cookPostComment.findMany({
      where: { postId: post.id, idempotencyKey },
    });
    assert.equal(commentsInDb.length, 1, "Exactly one comment record must exist in PostgreSQL");
    assert.equal(commentsInDb[0].id, res1.id);
    assert.equal(commentsInDb[0].text, "What a stunning heritage dish!");
    assert.equal(commentsInDb[0].authorId, customer.id);

    // Notification check: exactly one notification must be generated for the Cook
    const notifications = await database.userNotification.findMany({
      where: {
        userId: cook.id,
        portal: "COOK",
        eventKey: `social-post:${post.id}:comment-request:${customer.id}:${idempotencyKey}:cook:${cook.id}`,
      },
    });
    assert.equal(notifications.length, 1, "Exactly one notification row must exist for the post-owning Cook");
    ownedNotificationIds.add(notifications[0].id);
  });

  // =========================================================================
  // Test 2: Reusing an idempotency key with a changed payload returns 409 Conflict
  // =========================================================================
  await suite.test("2. Reusing an idempotency key with a changed payload is rejected with 409 Conflict", async () => {
    const cook = await createEligibleCookFixture();
    const customer = await createCustomerFixture();
    const post = await createPublishedPostFixture(cook.cookProfile.id);

    const customerActor = {
      id: customer.id,
      role: "CUSTOMER",
      activePortal: "CUSTOMER",
      status: "ACTIVE",
    };

    const idempotencyKey = `idemp-key-${randomUUID().replace(/-/g, "")}`;

    // Initial submission
    const originalComment = await postInteractionsService.createComment(
      customerActor,
      post.id,
      { text: "Original authentic recipe comment" },
      idempotencyKey,
    );
    assert.ok(originalComment?.id);
    ownedCommentIds.add(originalComment.id);

    // Attempt second submission with the SAME idempotency key but DIFFERENT payload text
    await assert.rejects(
      async () => {
        await postInteractionsService.createComment(
          customerActor,
          post.id,
          { text: "Completely different text with the same key!" },
          idempotencyKey,
        );
      },
      (err) => {
        assert.equal(err.statusCode, 409, `Expected HTTP 409 status code, got ${err.statusCode}`);
        assert.match(err.message, /already used for a different comment request/i);
        return true;
      },
    );

    // Verify in database: original comment text is preserved untouched
    const stored = await database.cookPostComment.findUnique({
      where: { id: originalComment.id },
    });
    assert.equal(stored.text, "Original authentic recipe comment");

    // Verify total comments for post is still 1
    const totalCount = await database.cookPostComment.count({ where: { postId: post.id } });
    assert.equal(totalCount, 1);
  });

  // =========================================================================
  // Test 3: Post deletion and related-record cascade behavior
  // =========================================================================
  await suite.test("3. Post deletion cascades and deletes related media, likes, and comments in PostgreSQL", async () => {
    const cook = await createEligibleCookFixture();
    const customer = await createCustomerFixture();
    const post = await createPublishedPostFixture(cook.cookProfile.id);

    // Add a like from customer
    const like = await database.cookPostLike.create({
      data: {
        postId: post.id,
        userId: customer.id,
      },
    });

    // Add a comment from customer
    const comment = await database.cookPostComment.create({
      data: {
        postId: post.id,
        authorId: customer.id,
        text: "Cascading comment test",
      },
    });
    ownedCommentIds.add(comment.id);

    // Confirm all 4 records exist prior to deletion
    const [mediaBefore, likesBefore, commentsBefore] = await Promise.all([
      database.cookPostMedia.count({ where: { postId: post.id } }),
      database.cookPostLike.count({ where: { postId: post.id } }),
      database.cookPostComment.count({ where: { postId: post.id } }),
    ]);
    assert.equal(mediaBefore, 1, "Media record must exist before deletion");
    assert.equal(likesBefore, 1, "Like record must exist before deletion");
    assert.equal(commentsBefore, 1, "Comment record must exist before deletion");

    // Perform deletion via cookSocialContentService
    const deleteResult = await cookSocialContentService.deletePost(cook.cookProfile.id, post.id);
    assert.equal(deleteResult.id, post.id);
    assert.equal(deleteResult.deleted, true);

    // Verify direct database cascade in PostgreSQL
    const [postAfter, mediaAfter, likesAfter, commentsAfter] = await Promise.all([
      database.cookPost.findUnique({ where: { id: post.id } }),
      database.cookPostMedia.findMany({ where: { postId: post.id } }),
      database.cookPostLike.findMany({ where: { postId: post.id } }),
      database.cookPostComment.findMany({ where: { postId: post.id } }),
    ]);

    assert.equal(postAfter, null, "CookPost row must be deleted");
    assert.equal(mediaAfter.length, 0, "CookPostMedia rows must be cascaded and deleted");
    assert.equal(likesAfter.length, 0, "CookPostLike rows must be cascaded and deleted");
    assert.equal(commentsAfter.length, 0, "CookPostComment rows must be cascaded and deleted");

    // Post was deleted, remove from set so cleanup doesn't error
    ownedPostIds.delete(post.id);
    ownedCommentIds.delete(comment.id);
  });

  // =========================================================================
  // Test 4: Expired Story and moderated-content exclusion
  // =========================================================================
  await suite.test("4. Expired Story and moderated content are excluded from public feeds", async () => {
    const cook = await createEligibleCookFixture();
    const now = new Date();

    // 1. Story A: Active (published 1 hour ago, expires 23 hours in future)
    const activeStory = await database.cookStory.create({
      data: {
        cookId: cook.cookProfile.id,
        caption: "Active Heritage Story",
        mediaType: "IMAGE",
        mediaUrl: "https://example.invalid/story-active.jpg",
        cloudinaryPublicId: `story-active-${randomUUID()}`,
        cloudinaryResourceType: "image",
        mediaMimeType: "image/jpeg",
        mediaBytes: 1024,
        publishedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
        expiresAt: new Date(now.getTime() + 23 * 60 * 60 * 1000),
        moderationHiddenAt: null,
      },
    });
    ownedStoryIds.add(activeStory.id);

    // 2. Story B: Expired (published 25 hours ago, expired 1 hour ago)
    const expiredStory = await database.cookStory.create({
      data: {
        cookId: cook.cookProfile.id,
        caption: "Expired Heritage Story",
        mediaType: "IMAGE",
        mediaUrl: "https://example.invalid/story-expired.jpg",
        cloudinaryPublicId: `story-expired-${randomUUID()}`,
        cloudinaryResourceType: "image",
        mediaMimeType: "image/jpeg",
        mediaBytes: 1024,
        publishedAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
        expiresAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
        moderationHiddenAt: null,
      },
    });
    ownedStoryIds.add(expiredStory.id);

    // 3. Story C: Moderated (active expiry window, but moderationHiddenAt is set)
    const moderatedStory = await database.cookStory.create({
      data: {
        cookId: cook.cookProfile.id,
        caption: "Moderated Heritage Story",
        mediaType: "IMAGE",
        mediaUrl: "https://example.invalid/story-moderated.jpg",
        cloudinaryPublicId: `story-mod-${randomUUID()}`,
        cloudinaryResourceType: "image",
        mediaMimeType: "image/jpeg",
        mediaBytes: 1024,
        publishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        expiresAt: new Date(now.getTime() + 22 * 60 * 60 * 1000),
        moderationHiddenAt: new Date(now.getTime() - 30 * 60 * 1000),
      },
    });
    ownedStoryIds.add(moderatedStory.id);

    // Query story groups via publicSocialContentService
    const storyGroups = await publicSocialContentService.listStoryGroups({ page: 1, limit: 50 });
    const cookGroup = storyGroups.items.find((g) => g.cook.id === cook.cookProfile.id);

    assert.ok(cookGroup, "Cook must have a story group in public feed");
    const returnedStoryIds = cookGroup.stories.map((s) => s.id);

    assert.ok(returnedStoryIds.includes(activeStory.id), "Active story must be included in public feed");
    assert.ok(!returnedStoryIds.includes(expiredStory.id), "Expired story must NOT be included in public feed");
    assert.ok(!returnedStoryIds.includes(moderatedStory.id), "Moderated story must NOT be included in public feed");

    // 4. Posts: Active vs Moderated vs Draft
    const activePost = await createPublishedPostFixture(cook.cookProfile.id);

    const moderatedPost = await database.cookPost.create({
      data: {
        cookId: cook.cookProfile.id,
        postType: "PHOTO",
        caption: "Moderated post",
        status: "PUBLISHED",
        publishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        moderationHiddenAt: new Date(now.getTime() - 10 * 60 * 1000),
        media: {
          create: [{
            mediaType: "IMAGE",
            mediaUrl: "https://example.invalid/post-mod.jpg",
            cloudinaryPublicId: `post-mod-${randomUUID()}`,
            cloudinaryResourceType: "image",
            sortOrder: 0,
            mediaMimeType: "image/jpeg",
            mediaBytes: 1024,
          }],
        },
      },
    });
    ownedPostIds.add(moderatedPost.id);

    const draftPost = await database.cookPost.create({
      data: {
        cookId: cook.cookProfile.id,
        postType: "PHOTO",
        caption: "Draft post",
        status: "DRAFT",
      },
    });
    ownedPostIds.add(draftPost.id);

    // Query posts via publicSocialContentService
    const publicPosts = await publicSocialContentService.listPosts({ page: 1, limit: 50 });
    const postIds = publicPosts.items.map((p) => p.id);

    assert.ok(postIds.includes(activePost.id), "Active published post must be included in public feed");
    assert.ok(!postIds.includes(moderatedPost.id), "Moderated post must NOT be included in public feed");
    assert.ok(!postIds.includes(draftPost.id), "Draft post must NOT be included in public feed");
  });

  // =========================================================================
  // Test 5: Duplicate pending-report rejection by the database constraint
  // =========================================================================
  await suite.test("5. Duplicate pending report is rejected by database constraint and allowed after moderation", async () => {
    const cook = await createEligibleCookFixture();
    const customer = await createCustomerFixture();
    const admin = await createAdminFixture();
    const post = await createPublishedPostFixture(cook.cookProfile.id);

    const customerActor = {
      id: customer.id,
      role: "CUSTOMER",
      activePortal: "CUSTOMER",
      status: "ACTIVE",
    };

    // 1. First report by customer
    const report1 = await socialReportingService.createReport(customerActor, {
      targetType: "POST",
      targetId: post.id,
      reason: "SPAM",
      explanation: "Spam comment on post",
    });
    assert.ok(report1?.id);
    assert.equal(report1.status, "PENDING");
    ownedReportIds.add(report1.id);

    // 2. Second report by same customer while first is still PENDING -> rejected with 409
    await assert.rejects(
      async () => {
        await socialReportingService.createReport(customerActor, {
          targetType: "POST",
          targetId: post.id,
          reason: "HARASSMENT",
          explanation: "Second report attempt",
        });
      },
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /already reported this content/i);
        return true;
      },
    );

    // Direct database level test: Attempting to insert a duplicate pending report
    // triggers PostgreSQL unique partial index: SocialContentReport_pending_reporter_target_key
    await assert.rejects(
      async () => {
        await database.socialContentReport.create({
          data: {
            reporterId: customer.id,
            targetType: "POST",
            targetId: post.id,
            postId: post.id,
            reason: "SPAM",
            explanation: "Direct SQL duplicate attempt",
            status: "PENDING",
          },
        });
      },
      (err) => {
        assert.equal(err.code, "P2002", "Prisma unique constraint violation code must be P2002");
        return true;
      },
    );

    // 3. Admin moderates the first report (DISMISS)
    const moderationResult = await socialReportingService.moderateReport(admin.id, report1.id, {
      action: "DISMISS",
      reason: "Verified content does not violate guidelines.",
    });
    assert.equal(moderationResult.status, "DISMISSED");

    // Track created moderation action for deterministic cleanup
    const action = await database.socialModerationAction.findFirst({
      where: { reportId: report1.id },
      select: { id: true },
    });
    if (action) ownedActionIds.add(action.id);

    // 4. Now that report 1 is no longer PENDING, customer can submit a new report on the same post
    const report2 = await socialReportingService.createReport(customerActor, {
      targetType: "POST",
      targetId: post.id,
      reason: "HARASSMENT",
      explanation: "New complaint after previous dismissal",
    });
    assert.ok(report2?.id);
    assert.notEqual(report2.id, report1.id);
    assert.equal(report2.status, "PENDING");
    ownedReportIds.add(report2.id);

    // Verify both reports exist in DB with their distinct statuses
    const reportsInDb = await database.socialContentReport.findMany({
      where: { reporterId: customer.id, targetId: post.id },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(reportsInDb.length, 2);
    assert.equal(reportsInDb[0].status, "DISMISSED");
    assert.equal(reportsInDb[1].status, "PENDING");
  });

  // =========================================================================
  // Test 6: Comment notification creation and duplicate prevention
  // =========================================================================
  await suite.test("6. Comment notification created for Cook with duplicate prevention, and self-comments create no notification", async () => {
    const cook = await createEligibleCookFixture();
    const customer = await createCustomerFixture();
    const post = await createPublishedPostFixture(cook.cookProfile.id);

    const customerActor = {
      id: customer.id,
      role: "CUSTOMER",
      activePortal: "CUSTOMER",
      status: "ACTIVE",
    };

    const idempotencyKey = `idemp-notify-${randomUUID().replace(/-/g, "")}`;

    // 1. Customer comments on cook's post
    const comment = await postInteractionsService.createComment(
      customerActor,
      post.id,
      { text: "Lovely flavors in this recipe!" },
      idempotencyKey,
    );
    ownedCommentIds.add(comment.id);

    const expectedEventKey = `social-post:${post.id}:comment-request:${customer.id}:${idempotencyKey}:cook:${cook.id}`;

    // Verify Cook received the notification
    const cookNotifications = await database.userNotification.findMany({
      where: {
        userId: cook.id,
        portal: "COOK",
        eventKey: expectedEventKey,
      },
    });
    assert.equal(cookNotifications.length, 1, "Cook must receive exactly 1 notification");
    const notif = cookNotifications[0];
    assert.equal(notif.portal, "COOK");
    assert.equal(notif.type, "SYSTEM_ALERT");
    assert.match(notif.title, /comment/i);
    assert.equal(notif.metadata?.kind, "SOCIAL_POST_COMMENT");
    assert.equal(notif.metadata?.postId, post.id);
    assert.equal(notif.metadata?.commentId, comment.id);
    ownedNotificationIds.add(notif.id);

    // 2. Duplicate prevention test: calling notificationsService.create with identical (userId, portal, eventKey)
    const duplicateAttempt = await notificationsService.create({
      userId: cook.id,
      portal: "COOK",
      type: "SYSTEM_ALERT",
      title: "Duplicate notification attempt",
      message: "Should be deduped via upsert on unique eventKey",
      eventKey: expectedEventKey,
    });
    assert.equal(duplicateAttempt.id, notif.id, "Upsert with existing eventKey must return existing notification ID");

    const totalCookNotifications = await database.userNotification.count({
      where: {
        userId: cook.id,
        portal: "COOK",
        eventKey: expectedEventKey,
      },
    });
    assert.equal(totalCookNotifications, 1, "Duplicate notification must be prevented by unique index");

    // 3. Self-comment test: Cook comments on their own post
    const cookActor = {
      id: cook.id,
      role: "COOK",
      activePortal: "COOK",
      status: "ACTIVE",
    };

    const cookSelfIdempKey = `idemp-self-${randomUUID().replace(/-/g, "")}`;
    const notificationsCountBeforeSelfComment = await database.userNotification.count({
      where: { userId: cook.id },
    });

    const selfComment = await postInteractionsService.createComment(
      cookActor,
      post.id,
      { text: "Thank you for the warm feedback!" },
      cookSelfIdempKey,
    );
    assert.ok(selfComment?.id);
    ownedCommentIds.add(selfComment.id);

    const notificationsCountAfterSelfComment = await database.userNotification.count({
      where: { userId: cook.id },
    });
    assert.equal(
      notificationsCountAfterSelfComment,
      notificationsCountBeforeSelfComment,
      "Self-comment by post owner must generate ZERO notifications",
    );
  });
});
