import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createPostInteractionsService } from "../modules/cook/post-interactions.service.js";
import { createPostCommentSchema, likePostSchema, listCookPostCommentsSchema, requireCommentIdempotencyKey } from "../modules/cook/post-interactions.validation.js";
import { createSocialCommentRateLimiter } from "../middlewares/socialCommentRateLimit.js";
import { createMemoryRateLimitStore } from "../middlewares/authRateLimit.js";

const now = new Date("2026-10-19T12:00:00.000Z");
const ready = () => ({ readyToSell: true, pendingRequirements: [] });
const publicPost = { id: "post-1", cookId: "cook-owner", status: "PUBLISHED", publishedAt: now, media: [{ id: "media-1" }] };

const makeDb = ({ visible = true, comments: initialComments = [], likes: initialLikes = [] } = {}) => {
  const likes = [...initialLikes];
  const comments = [...initialComments];
  const calls = { postWhere: [], likeUpserts: [], likeDeletes: [], commentCreates: [], commentUpdates: [], commentQueries: [], notificationUpserts: [] };
  const db = {
    cookProfile: {
      findUnique: async ({ where }) => where.id
        ? { id: where.id, userId: where.id === "cook-owner" ? "cook-user" : "other-cook-user" }
        : ({ id: where.userId === "cook-user" ? "cook-owner" : "cook-other", user: { role: "COOK", status: "ACTIVE" } }),
    },
    cookPost: {
      findFirst: async ({ where }) => {
        calls.postWhere.push(where);
        return visible && where.id === publicPost.id ? publicPost : null;
      },
      findUnique: async ({ where }) => where.id === "post-1" ? { cookId: "cook-owner" } : null,
    },
    cookPostLike: {
      upsert: async ({ where, create }) => {
        calls.likeUpserts.push({ where, create });
        let row = likes.find((like) => like.userId === create.userId && like.postId === create.postId);
        if (!row) { row = { id: `like-${likes.length + 1}`, ...create }; likes.push(row); }
        return row;
      },
      deleteMany: async ({ where }) => {
        calls.likeDeletes.push(where);
        const before = likes.length;
        for (let index = likes.length - 1; index >= 0; index -= 1) {
          if (likes[index].userId === where.userId && likes[index].postId === where.postId) likes.splice(index, 1);
        }
        return { count: before - likes.length };
      },
      count: async ({ where }) => likes.filter((like) => like.postId === where.postId).length,
      findUnique: async ({ where }) => likes.find((like) => like.userId === where.userId_postId.userId && like.postId === where.userId_postId.postId) || null,
    },
    cookPostComment: {
      count: async ({ where }) => comments.filter((comment) => comment.postId === where.postId && !comment.deletedAt && !comment.moderationHiddenAt).length,
      findMany: async (args) => {
        calls.commentQueries.push(args);
        return comments.filter((comment) => comment.postId === args.where.postId).slice(args.skip, args.skip + args.take);
      },
      findFirst: async ({ where }) => comments.find((comment) => comment.id === where.id && comment.postId === where.postId && !comment.deletedAt && !comment.moderationHiddenAt) || null,
      findUnique: async ({ where }) => where.id
        ? comments.find((comment) => comment.id === where.id) || null
        : comments.find((comment) => comment.authorId === where.authorId_idempotencyKey.authorId && comment.idempotencyKey === where.authorId_idempotencyKey.idempotencyKey) || null,
      create: async ({ data }) => {
        calls.commentCreates.push(data);
        if (data.idempotencyKey && comments.some((comment) => comment.authorId === data.authorId && comment.idempotencyKey === data.idempotencyKey)) {
          const error = new Error("unique constraint");
          error.code = "P2002";
          throw error;
        }
        const row = { id: `comment-${comments.length + 1}`, ...data, createdAt: now, deletedAt: null, author: { name: "Private Customer Name", cookProfile: null } };
        comments.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        calls.commentUpdates.push({ where, data });
        const row = comments.find((comment) => comment.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    userNotification: {
      upsert: async ({ where, create }) => {
        calls.notificationUpserts.push({ where, create });
        const key = where.userId_portal_eventKey;
        let notification = notifications.find((item) => item.userId === key.userId && item.portal === key.portal && item.eventKey === key.eventKey);
        if (!notification) { notification = { id: `notification-${notifications.length + 1}`, ...create }; notifications.push(notification); }
        return notification;
      },
    },
    $transaction: (() => {
      let tail = Promise.resolve();
      return (callback) => {
        const transaction = tail.then(async () => {
          const previous = { comments: [...comments], likes: [...likes], notifications: [...notifications] };
          try { return await callback(db); }
          catch (error) {
            comments.splice(0, comments.length, ...previous.comments);
            likes.splice(0, likes.length, ...previous.likes);
            notifications.splice(0, notifications.length, ...previous.notifications);
            throw error;
          }
        });
        tail = transaction.then(() => undefined, () => undefined);
        return transaction;
      };
    })(),
  };
  const notifications = [];
  return { db, calls, likes, comments, notifications };
};

const customer = { id: "customer-1", status: "ACTIVE", activePortal: "CUSTOMER" };
const cook = { id: "cook-user", status: "ACTIVE", activePortal: "COOK" };
const serviceFor = (db) => createPostInteractionsService(db, {
  now: () => now,
  findEligibleCookIds: async () => ["cook-owner", "cook-other"],
  readiness: ready,
});

test("repeated and concurrent likes are idempotent and return the exact count and viewer state", async () => {
  const { db, likes, notifications } = makeDb();
  const service = serviceFor(db);
  const results = await Promise.all(Array.from({ length: 8 }, () => service.likePost(customer, "post-1")));
  assert.equal(likes.length, 1);
  assert.ok(results.every((result) => result.likeCount === 1 && result.likedByMe));
  assert.deepEqual(Object.keys(results[0]).sort(), ["likeCount", "likedByMe", "postId"]);
  assert.equal(await service.getLikeState(customer, "post-1").then((result) => result.likeCount), 1);
  assert.equal(notifications.length, 0, "likes do not emit comment notifications");
});

test("unlike removes only the authenticated user's like", async () => {
  const { db, likes, calls } = makeDb({ likes: [
    { id: "mine", userId: customer.id, postId: "post-1" },
    { id: "theirs", userId: "customer-2", postId: "post-1" },
  ] });
  const result = await serviceFor(db).unlikePost(customer, "post-1");
  assert.deepEqual(likes.map(({ id }) => id), ["theirs"]);
  assert.deepEqual(calls.likeDeletes[0], { userId: customer.id, postId: "post-1" });
  assert.deepEqual(result, { postId: "post-1", likeCount: 1, likedByMe: false });
});

test("like reads and writes reject logged-out, unsupported, and ineligible Cook actors", async () => {
  const { db } = makeDb();
  const service = createPostInteractionsService(db, {
    now: () => now,
    findEligibleCookIds: async () => ["cook-owner"],
    readiness: () => ({ readyToSell: false, pendingRequirements: [{}] }),
  });
  await assert.rejects(service.likePost(null, "post-1"), { statusCode: 401 });
  await assert.rejects(service.likePost({ ...customer, activePortal: "ADMIN" }, "post-1"), { statusCode: 403 });
  await assert.rejects(service.likePost(cook, "post-1"), { statusCode: 403 });
});

test("draft, deleted, expired/unpublished, Story IDs, and ineligible Cook Posts cannot receive interactions", async () => {
  const { db, calls, notifications } = makeDb({ visible: false });
  const service = serviceFor(db);
  await assert.rejects(service.likePost(customer, "draft-or-story-id"), { statusCode: 404 });
  await assert.rejects(service.createComment(customer, "draft-or-story-id", { text: "Hello" }, "hidden-post-request-key-0001"), { statusCode: 404 });
  assert.equal(calls.postWhere.length, 2);
  assert.equal(calls.postWhere[0].status, "PUBLISHED");
  assert.deepEqual(calls.postWhere[0].publishedAt, { not: null, lte: now });
  assert.equal(calls.postWhere[0].moderationHiddenAt, null);
  assert.deepEqual(calls.postWhere[0].cook.is.id.in, ["cook-owner", "cook-other"]);
  assert.equal(notifications.length, 0);
  const emptyEligibility = createPostInteractionsService(db, { now: () => now, findEligibleCookIds: async () => [] });
  await assert.rejects(emptyEligibility.unlikePost(customer, "post-1"), { statusCode: 404 });
});

test("comments reject whitespace-only and overlong input at validation and service boundaries", async () => {
  await assert.rejects(createPostCommentSchema.body.parseAsync({ text: "   " }));
  await assert.rejects(createPostCommentSchema.body.parseAsync({ text: "x".repeat(301) }));
  const service = serviceFor(makeDb().db);
  await assert.rejects(service.createComment(null, "post-1", { text: "Hello" }, "unauthenticated-request-key-01"), { statusCode: 401 });
  await assert.rejects(service.createComment(customer, "post-1", { text: "  " }, "empty-comment-request-key-001"), { statusCode: 400 });
  await assert.rejects(service.createComment(customer, "post-1", { text: "x".repeat(301) }, "overlong-comment-request-key-01"), { statusCode: 400 });
});

test("customers and eligible Cooks can create safe comments and same-Post replies", async () => {
  const { db, calls, notifications } = makeDb();
  const service = serviceFor(db);
  const created = await service.createComment(customer, "post-1", { text: "  Nice recipe  " }, "customer-comment-request-0001");
  assert.equal(created.text, "Nice recipe");
  assert.deepEqual(created.author, { displayName: "Private Customer Name", role: "CUSTOMER" });
  assert.equal(created.author.email, undefined);
  const reply = await service.createComment(cook, "post-1", { text: "Thank you!", parentId: created.id }, "cook-reply-request-0001");
  assert.equal(reply.parentId, created.id);
  assert.deepEqual(calls.commentCreates[1], {
    postId: "post-1", authorId: cook.id, parentId: created.id, text: "Thank you!",
    idempotencyKey: "cook-reply-request-0001",
    requestFingerprint: createHash("sha256").update(JSON.stringify({ operation: "CREATE_POST_COMMENT", postId: "post-1", text: "Thank you!", parentId: created.id })).digest("hex"),
  });
  assert.equal(notifications.length, 1, "the owner Cook is not notified about her own reply");
  assert.equal(notifications[0].userId, "cook-user");
  assert.equal(notifications[0].portal, "COOK");
  assert.equal(notifications[0].title, "New comment on your Post");
  assert.deepEqual(notifications[0].metadata, {
    kind: "SOCIAL_POST_COMMENT", postId: "post-1", commentId: created.id,
    href: `/cook/stories?tab=Comments&postId=${encodeURIComponent("post-1")}`,
  });
  assert.equal(notifications[0].metadata.privateUserId, undefined);
  assert.equal(notifications[0].message.includes("Private Customer Name"), false);
});

test("comment retries return the original persisted comment and do not duplicate comments or notifications", async () => {
  const { db, notifications, calls } = makeDb();
  const service = serviceFor(db);
  const first = await service.createComment(customer, "post-1", { text: "A retryable comment" }, "stable-comment-request-key-0001");
  const retry = await service.createComment(customer, "post-1", { text: "A retryable comment" }, "stable-comment-request-key-0001");
  assert.equal(retry.id, first.id);
  assert.equal(calls.commentCreates.length, 1);
  assert.equal(calls.notificationUpserts.length, 1);
  assert.equal((await db.cookPostComment.count({ where: { postId: "post-1" } })), 1);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].eventKey, /comment-request:customer-1:stable-comment-request-key-0001:cook:cook-user$/);
});

test("same-key concurrent comment requests persist one comment and emit one notification", async () => {
  const { db, calls, comments, notifications } = makeDb();
  const service = serviceFor(db);
  const results = await Promise.all(Array.from({ length: 8 }, () => service.createComment(
    customer, "post-1", { text: "Concurrent request" }, "concurrent-comment-request-0001",
  )));
  assert.equal(new Set(results.map(({ id }) => id)).size, 1);
  assert.equal(comments.length, 1);
  assert.equal(calls.commentCreates.length, 1);
  assert.equal(calls.notificationUpserts.length, 1);
  assert.equal(notifications.length, 1);
});

test("an idempotency key cannot be reused for a different Post, text, or reply parent", async () => {
  for (const changedPayload of [
    { postId: "post-2", text: "Original text", parentId: "parent-a" },
    { postId: "post-1", text: "Changed text", parentId: "parent-a" },
    { postId: "post-1", text: "Original text", parentId: "parent-b" },
  ]) {
    const { db, comments, notifications } = makeDb({ comments: [
      { id: "parent-a", postId: "post-1", authorId: "customer-2", text: "A", deletedAt: null },
      { id: "parent-b", postId: "post-1", authorId: "customer-2", text: "B", deletedAt: null },
    ] });
    db.cookPost.findFirst = async ({ where }) => ["post-1", "post-2"].includes(where.id) ? { id: where.id, cookId: "cook-owner" } : null;
    const service = serviceFor(db);
    await service.createComment(customer, "post-1", { text: "Original text", parentId: "parent-a" }, "payload-bound-comment-key-0001");
    await assert.rejects(service.createComment(customer, changedPayload.postId, changedPayload, "payload-bound-comment-key-0001"), { statusCode: 409 });
    assert.equal(comments.filter(({ id }) => id.startsWith("comment-")).length, 1);
    assert.equal(notifications.length, 1);
  }
});

test("idempotency keys are scoped to the authenticated user and reply retries replay the original", async () => {
  const { db, comments, notifications, calls } = makeDb();
  const service = serviceFor(db);
  const parent = await service.createComment(customer, "post-1", { text: "Question" }, "reply-parent-request-key-01");
  const key = "shared-comment-request-key-001";
  const [reply, replay] = await Promise.all([
    service.createComment(customer, "post-1", { text: "Reply", parentId: parent.id }, key),
    service.createComment(customer, "post-1", { text: "Reply", parentId: parent.id }, key),
  ]);
  assert.equal(reply.id, replay.id);
  const otherUser = { id: "customer-2", status: "ACTIVE", activePortal: "CUSTOMER" };
  const independent = await service.createComment(otherUser, "post-1", { text: "Reply", parentId: parent.id }, key);
  assert.notEqual(independent.id, reply.id);
  assert.equal(comments.length, 3);
  assert.equal(notifications.length, 3);
});

test("a unique-index race replays the committed winner without another notification", async () => {
  const { db, comments, notifications, calls } = makeDb();
  const key = "unique-race-comment-key-0001";
  const fingerprint = createHash("sha256").update(JSON.stringify({
    operation: "CREATE_POST_COMMENT", postId: "post-1", text: "Race winner", parentId: null,
  })).digest("hex");
  const originalTransaction = db.$transaction;
  let injectWinner = true;
  db.cookPostComment.create = async () => {
    const error = new Error("unique constraint");
    error.code = "P2002";
    throw error;
  };
  db.$transaction = async (callback) => {
    try { return await originalTransaction(callback); }
    catch (error) {
      if (injectWinner && error.code === "P2002") {
        injectWinner = false;
        comments.push({
          id: "race-winner", postId: "post-1", authorId: customer.id, parentId: null,
          text: "Race winner", idempotencyKey: key, requestFingerprint: fingerprint, createdAt: now,
          deletedAt: null, moderationHiddenAt: null, author: { name: "Private Customer Name", cookProfile: null },
        });
        notifications.push({
          id: "race-notification", userId: "cook-user", portal: "COOK",
          eventKey: `social-post:post-1:comment-request:${customer.id}:${key}:cook:cook-user`,
        });
      }
      throw error;
    }
  };
  const result = await serviceFor(db).createComment(customer, "post-1", { text: "Race winner" }, key);
  assert.equal(result.id, "race-winner");
  assert.equal(comments.length, 1);
  assert.equal(notifications.length, 1, "the winning transaction's notification remains the only notification");
  assert.equal(calls.notificationUpserts.length, 0, "the replay path does not invoke notification creation");
});

test("a reply on another Cook's Post notifies that Post's owner with a reply link", async () => {
  const { db, notifications } = makeDb();
  db.cookPost.findFirst = async ({ where }) => where.id === "other-post" ? { id: "other-post", cookId: "cook-other" } : null;
  db.cookPostComment.findFirst = async ({ where }) => ({ id: where.id, postId: where.postId });
  await serviceFor(db).createComment(customer, "other-post", { text: "Reply", parentId: "parent" }, "customer-reply-request-0001");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].userId, "other-cook-user");
  assert.equal(notifications[0].title, "New reply on your Post");
});

test("self-comments and failed comment or notification persistence never leave notifications", async () => {
  const self = { id: "cook-user", status: "ACTIVE", activePortal: "CUSTOMER" };
  const selfFixture = makeDb();
  await serviceFor(selfFixture.db).createComment(self, "post-1", { text: "My own post" }, "self-comment-request-00001");
  assert.equal(selfFixture.notifications.length, 0);

  const commentFailure = makeDb();
  commentFailure.db.cookPostComment.create = async () => { throw new Error("comment persistence failed"); };
  await assert.rejects(serviceFor(commentFailure.db).createComment(customer, "post-1", { text: "Not persisted" }, "failed-comment-request-0001"), /comment persistence failed/);
  assert.equal(commentFailure.calls.notificationUpserts.length, 0);

  const notificationFailure = makeDb();
  notificationFailure.db.userNotification.upsert = async () => { throw new Error("notification persistence failed"); };
  await assert.rejects(serviceFor(notificationFailure.db).createComment(customer, "post-1", { text: "Atomic write" }, "failed-notification-request-0001"), /notification persistence failed/);
  assert.equal(notificationFailure.comments.length, 0, "comment creation rolls back with the notification failure");
});

test("reply parents must be active comments belonging to the same Post", async () => {
  const { db } = makeDb();
  const service = serviceFor(db);
  await assert.rejects(service.createComment(customer, "post-1", { text: "Reply", parentId: "comment-other-post" }, "wrong-parent-request-key-0001"), { statusCode: 400 });
});

test("comment listing returns safe paginated data and an accurate live comment count", async () => {
  const existing = [
    { id: "c1", postId: "post-1", parentId: null, text: "First", createdAt: now, deletedAt: null, author: { name: "Cook account name", cookProfile: { businessName: "Kitchen" }, email: "private" } },
    { id: "c2", postId: "post-1", parentId: "c1", text: "Reply", createdAt: now, deletedAt: null, author: { name: "Customer", cookProfile: null } },
  ];
  const { db } = makeDb({ comments: existing });
  const result = await serviceFor(db).listComments("post-1", { page: 2, limit: 1 });
  assert.equal(result.commentCount, 2);
  assert.deepEqual(result.pagination, { page: 2, limit: 1, total: 2, totalPages: 2 });
  assert.equal(result.items[0].author.displayName, "Customer");
  assert.equal(result.items[0].author.email, undefined);
  assert.equal(result.items[0].canDelete, false);
});

test("comment listing returns viewer-specific delete permission without exposing account IDs", async () => {
  const existing = [
    { id: "mine", postId: "post-1", authorId: customer.id, parentId: null, text: "Mine", createdAt: now, deletedAt: null, author: { name: "Customer", cookProfile: null } },
    { id: "other", postId: "post-1", authorId: "customer-2", parentId: null, text: "Other", createdAt: now, deletedAt: null, author: { name: "Other", cookProfile: null } },
  ];
  const { db } = makeDb({ comments: existing });
  const service = serviceFor(db);
  const customerResult = await service.listComments("post-1", { page: 1, limit: 20 }, customer);
  assert.deepEqual(customerResult.items.map(({ canDelete }) => canDelete), [true, false]);
  assert.equal("authorId" in customerResult.items[0], false);
  const cookResult = await service.listComments("post-1", { page: 1, limit: 20 }, cook);
  assert.deepEqual(cookResult.items.map(({ canDelete }) => canDelete), [true, true]);
});

test("Cook comment listing scopes root threads and replies to the authenticated Cook's Posts", async () => {
  const root = {
    id: "root", postId: "owned-post", parentId: null, text: "Guest comment", createdAt: now, deletedAt: null,
    author: { name: "Guest", cookProfile: null },
    post: { id: "owned-post", postType: "RECIPE", caption: "Soup", media: [{ id: "photo", mediaType: "IMAGE", mediaUrl: "safe-url" }] },
    replies: [{ id: "reply", postId: "owned-post", parentId: "root", text: "Cook reply", createdAt: now, deletedAt: null, author: { name: "Cook account", cookProfile: { businessName: "My Kitchen" } } }],
  };
  const calls = [];
  const database = {
    cookProfile: { findUnique: async ({ where }) => ({ id: where.userId === cook.id ? "cook-owner" : "other-cook" }) },
    cookPostComment: {
      count: async ({ where }) => { calls.push(where); return where.parentId === null ? 1 : 2; },
      findMany: async (args) => { calls.push(args.where); return [root]; },
    },
  };
  const result = await createPostInteractionsService(database).listCookComments(cook, { page: 1, limit: 20 });
  assert.deepEqual(calls[0].post, { is: { cookId: "cook-owner" } });
  assert.deepEqual(calls[1].post, { is: { cookId: "cook-owner" } });
  assert.equal(result.items[0].canDelete, true);
  assert.equal(result.items[0].replies[0].author.role, "COOK");
  assert.equal(result.items[0].post.media[0].mediaUrl, "safe-url");
  assert.equal(result.commentCount, 2);
  await assert.rejects(createPostInteractionsService(database).listCookComments(customer, { page: 1, limit: 20 }), { statusCode: 403 });
});

test("Cook comment deep links filter server-side to the owning Cook's requested Post", async () => {
  const root = { id: "root", postId: "owned-post", parentId: null, text: "comment", createdAt: now, deletedAt: null, author: null, post: { id: "owned-post", media: [] }, replies: [] };
  const queries = [];
  const database = {
    cookProfile: { findUnique: async () => ({ id: "cook-owner" }) },
    cookPostComment: {
      count: async ({ where }) => { queries.push(where); return 1; },
      findMany: async ({ where }) => { queries.push(where); return [root]; },
    },
  };
  await createPostInteractionsService(database).listCookComments(cook, { page: 1, limit: 20, postId: "owned-post" });
  assert.deepEqual(queries[0].post, { is: { cookId: "cook-owner", id: "owned-post" } });
  assert.deepEqual(queries[1].post, { is: { cookId: "cook-owner", id: "owned-post" } });
  await listCookPostCommentsSchema.query.parseAsync({ page: "1", limit: "20", postId: "owned-post" });
});

test("Cook replying on another Cook's public Post acts as herself, not as its owner", async () => {
  const { db, calls } = makeDb({ comments: [{ id: "parent", postId: "other-post", authorId: "customer-1", text: "Question", deletedAt: null }] });
  db.cookPost.findFirst = async ({ where }) => where.id === "other-post" ? { id: "other-post", cookId: "cook-other" } : null;
  const service = serviceFor(db);
  await service.createComment(cook, "other-post", { text: "Reply as myself", parentId: "parent" }, "cross-owner-reply-key-000001");
  assert.deepEqual(
    { postId: calls.commentCreates[0].postId, authorId: calls.commentCreates[0].authorId, parentId: calls.commentCreates[0].parentId, text: calls.commentCreates[0].text },
    { postId: "other-post", authorId: cook.id, parentId: "parent", text: "Reply as myself" },
  );
});

test("deleted parent comments remain as private-safe tombstones so replies retain context", async () => {
  const existing = [
    { id: "parent", postId: "post-1", parentId: null, text: null, createdAt: now, deletedAt: now, author: null },
    { id: "reply", postId: "post-1", parentId: "parent", text: "Reply", createdAt: now, deletedAt: null, author: { name: "Customer", cookProfile: null } },
  ];
  const { db } = makeDb({ comments: existing });
  const result = await serviceFor(db).listComments("post-1", { page: 1, limit: 20 });
  assert.equal(result.commentCount, 1);
  assert.equal(result.items[0].deleted, true);
  assert.equal(result.items[0].text, null);
  assert.equal(result.items[0].author, null);
  assert.equal(result.items[1].parentId, "parent");
});

test("moderation-hidden comments become neutral thread tombstones and cannot receive replies", async () => {
  const hidden = { id: "hidden", postId: "post-1", authorId: "customer-2", parentId: null, text: "Hidden text", createdAt: now, deletedAt: null, moderationHiddenAt: now };
  const { db, calls } = makeDb({ comments: [hidden] });
  const service = serviceFor(db);
  const result = await service.listComments("post-1", { page: 1, limit: 20 });
  assert.equal(result.commentCount, 0);
  assert.equal(result.items[0].text, null);
  assert.equal(result.items[0].moderatedHidden, true);
  assert.equal(result.items[0].author, null);
  await assert.rejects(service.createComment(customer, "post-1", { text: "reply", parentId: "hidden" }, "hidden-parent-request-key-01"), { statusCode: 400 });
  assert.equal(calls.commentCreates.length, 0);
});

test("authors can delete their comments; the owning Cook can moderate, but another Cook cannot", async () => {
  const comments = [
    { id: "own", postId: "post-1", authorId: customer.id, parentId: null, text: "Mine", createdAt: now, deletedAt: null, post: { cookId: "cook-owner" } },
    { id: "on-post", postId: "post-1", authorId: "customer-2", parentId: null, text: "Guest", createdAt: now, deletedAt: null, post: { cookId: "cook-owner" } },
    { id: "other-post", postId: "post-2", authorId: "customer-2", parentId: null, text: "Guest", createdAt: now, deletedAt: null, post: { cookId: "cook-other" } },
  ];
  const { db, calls } = makeDb({ comments });
  const service = serviceFor(db);
  assert.deepEqual(await service.deleteComment(customer, "own"), { id: "own", deleted: true });
  assert.deepEqual(await service.deleteComment(cook, "on-post"), { id: "on-post", deleted: true });
  await assert.rejects(service.deleteComment(cook, "other-post"), { statusCode: 404 });
  assert.equal(calls.commentUpdates.length, 2);
  assert.equal(comments[0].text, null);
  assert.ok(comments[0].deletedAt);
});

test("comment rate limiting is bounded per authenticated user and returns Retry-After", () => {
  let time = 0;
  const store = createMemoryRateLimitStore({ now: () => time, maxBuckets: 2 });
  const limiter = createSocialCommentRateLimiter({ limit: 1, windowMs: 60_000, rateStore: store });
  const response = { headers: {}, status(code) { this.statusCode = code; return this; }, setHeader(name, value) { this.headers[name] = value; }, json(body) { this.body = body; return this; } };
  let nextCalls = 0;
  limiter({ user: { id: "u1" } }, response, () => { nextCalls += 1; });
  limiter({ user: { id: "u1" } }, response, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers["Retry-After"], "60");
  time = 60_001;
  limiter({ user: { id: "u1" } }, response, () => { nextCalls += 1; });
  assert.equal(nextCalls, 2);
});

test("interaction mutations require authentication and act only through req.user identity", async () => {
  await assert.rejects(likePostSchema.body.parseAsync({ userId: "attacker-controlled" }));
  const routes = await (await import("node:fs/promises")).readFile(new URL("../modules/cook/public-social-content.routes.js", import.meta.url), "utf8");
  assert.match(routes, /router\.post\("\/posts\/:id\/likes", authenticate, validate\(likePostSchema\), likePost\)/);
  assert.match(routes, /router\.post\("\/posts\/:id\/comments", authenticate, requireCommentIdempotencyKey, createSocialCommentRateLimiter\(\), validate\(createPostCommentSchema\), createPostComment\)/);
  assert.match(routes, /router\.get\("\/posts\/:id\/comments", optionalAuthenticate, validate\(listPostCommentsSchema\), listPostComments\)/);
  assert.match(routes, /router\.delete\("\/comments\/:commentId", authenticate, validate\(commentIdSchema\), deletePostComment\)/);
  const controller = await (await import("node:fs/promises")).readFile(new URL("../modules/cook/post-interactions.controller.js", import.meta.url), "utf8");
  assert.match(controller, /interactions\.likePost\(req\.user, req\.params\.id\)/);
  assert.doesNotMatch(controller, /req\.body\.userId/);
  assert.match(controller, /req\.commentIdempotencyKey/);
  let error;
  requireCommentIdempotencyKey({ get: () => "short" }, {}, (caught) => { error = caught; });
  assert.equal(error.statusCode, 400);
  let acceptedKey;
  requireCommentIdempotencyKey({ get: () => "request-key-1234567890" }, {}, (caught) => { acceptedKey = caught; });
  assert.equal(acceptedKey, undefined);
});
