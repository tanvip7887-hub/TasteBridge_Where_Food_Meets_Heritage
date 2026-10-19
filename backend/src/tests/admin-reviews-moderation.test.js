import test from "node:test";
import assert from "node:assert/strict";
import { createReviewsService } from "../modules/reviews/reviews.service.js";
import { adminReportedReviewsSchema, moderateReviewSchema } from "../modules/reviews/reviews.validation.js";
import { requireRole } from "../middlewares/auth.js";

const now = new Date("2026-10-17T14:00:00.000Z");

const makeDb = ({
  reviews = [],
  reports = [],
  cooks = [],
  moderationLogs = [],
} = {}) => {
  const calls = {
    reviewUpdates: [],
    reportUpdates: [],
    moderationLogs: [],
    notifications: [],
  };

  const transaction = {
    review: {
      findUnique: async ({ where }) => {
        return reviews.find((r) => r.id === where.id) || null;
      },
      findFirst: async ({ where }) => {
        return reviews.find((r) => {
          if (where.id && r.id !== where.id) return false;
          if (where.cookId && r.cookId !== where.cookId) return false;
          return true;
        }) || null;
      },
      update: async ({ where, data }) => {
        const item = reviews.find((r) => r.id === where.id);
        if (!item) throw new Error("Review not found for update");
        Object.assign(item, data);
        calls.reviewUpdates.push({ where, data });
        return item;
      },
      findMany: async ({ where = {}, skip = 0, take = 20 }) => {
        return reviews.filter((r) => {
          if (where.status && r.status !== where.status) return false;
          if (where.cookId && r.cookId !== where.cookId) return false;
          if (where.dishId && r.dishId !== where.dishId) return false;
          return true;
        }).slice(skip, skip + take);
      },
      count: async ({ where = {} }) => {
        return reviews.filter((r) => {
          if (where.status && r.status !== where.status) return false;
          if (where.cookId && r.cookId !== where.cookId) return false;
          if (where.dishId && r.dishId !== where.dishId) return false;
          return true;
        }).length;
      },
      aggregate: async ({ where = {} }) => {
        const matched = reviews.filter((r) => {
          if (where.status && r.status !== where.status) return false;
          if (where.cookId && r.cookId !== where.cookId) return false;
          if (where.dishId && r.dishId !== where.dishId) return false;
          return true;
        });
        const count = matched.length;
        const sum = matched.reduce((acc, r) => acc + r.rating, 0);
        return {
          _count: { _all: count },
          _avg: { rating: count > 0 ? sum / count : 0 },
        };
      },
    },
    reviewReport: {
      findMany: async ({ where = {}, skip = 0, take = 20 }) => {
        return reports.filter((rep) => {
          if (where.reviewId && rep.reviewId !== where.reviewId) return false;
          if (where.status && rep.status !== where.status) return false;
          if (where.review?.isReported !== undefined && rep.review?.isReported !== where.review.isReported) return false;
          if (where.review?.status && rep.review?.status !== where.review.status) return false;
          if (where.review?.reviewType && rep.review?.reviewType !== where.review.reviewType) return false;
          return true;
        }).slice(skip, skip + take);
      },
      count: async ({ where = {} }) => {
        return reports.filter((rep) => {
          if (where.reviewId && rep.reviewId !== where.reviewId) return false;
          if (where.status && rep.status !== where.status) return false;
          if (where.review?.isReported !== undefined && rep.review?.isReported !== where.review.isReported) return false;
          if (where.review?.status && rep.review?.status !== where.review.status) return false;
          if (where.review?.reviewType && rep.review?.reviewType !== where.review.reviewType) return false;
          return true;
        }).length;
      },
      updateMany: async ({ where, data }) => {
        calls.reportUpdates.push({ where, data });
        const matched = reports.filter((rep) => {
          if (where.reviewId && rep.reviewId !== where.reviewId) return false;
          if (where.status && rep.status !== where.status) return false;
          return true;
        });
        for (const item of matched) {
          Object.assign(item, data);
        }
        return { count: matched.length };
      },
    },
    reviewModerationLog: {
      create: async ({ data }) => {
        calls.moderationLogs.push(data);
        moderationLogs.push(data);
        return { id: `log-${moderationLogs.length}`, ...data, createdAt: now };
      },
    },
    cookProfile: {
      findUnique: async ({ where }) => {
        return cooks.find((c) => c.id === where.id) || null;
      },
    },
    dish: {
      findFirst: async ({ where }) => {
        const rev = reviews.find((r) => r.dishId === where.id);
        return rev ? { id: where.id } : null;
      },
    },
    userNotification: {
      upsert: async (args) => {
        calls.notifications.push(args);
        return { id: "notif-1" };
      },
      create: async (args) => {
        calls.notifications.push(args);
        return { id: "notif-1" };
      },
    },
  };

  const db = {
    ...transaction,
    $transaction: async (fn) => fn(transaction),
  };

  return { db, calls, reviews, reports, moderationLogs };
};

test("admin-only authorization: requireRole('ADMIN') rejects unauthenticated, customer, and cook users", () => {
  const guard = requireRole("ADMIN");

  let unauthError;
  guard({ user: null }, {}, (err) => { unauthError = err; });
  assert.equal(unauthError?.statusCode, 401);

  let custError;
  guard({ user: { role: "CUSTOMER" } }, {}, (err) => { custError = err; });
  assert.equal(custError?.statusCode, 403);

  let cookError;
  guard({ user: { role: "COOK" } }, {}, (err) => { cookError = err; });
  assert.equal(cookError?.statusCode, 403);

  let allowed = false;
  guard({ user: { role: "ADMIN" } }, {}, (err) => { allowed = !err; });
  assert.equal(allowed, true);
});

test("reported review queue filtering in listReported supports status, type, and pagination", async () => {
  const reviews = [
    {
      id: "rev-food-1",
      reviewType: "FOOD",
      rating: 1,
      comment: "Terrible food",
      status: "PUBLISHED",
      isReported: true,
      subjectNameSnapshot: "Paneer Tikka",
      cookNameSnapshot: "Spicy Treats",
      customer: { name: "Tanvi Patel" },
      createdAt: now,
    },
    {
      id: "rev-exp-1",
      reviewType: "EXPERIENCE",
      rating: 2,
      comment: "Disorganized event",
      status: "PUBLISHED",
      isReported: true,
      subjectNameSnapshot: "Sourdough Masterclass",
      cookNameSnapshot: "Chef Mario",
      customer: { name: "Rahul Sharma" },
      createdAt: now,
    },
  ];

  const reports = [
    {
      id: "rep-1",
      reviewId: "rev-food-1",
      cookId: "cook-1",
      reason: "Abusive and defamatory language",
      status: "ACTIVE",
      createdAt: now,
      review: reviews[0],
    },
    {
      id: "rep-2",
      reviewId: "rev-exp-1",
      cookId: "cook-2",
      reason: "Customer attended different session",
      status: "ACTIVE",
      createdAt: now,
      review: reviews[1],
    },
  ];

  const { db } = makeDb({ reviews, reports });
  const service = createReviewsService(db, { now: () => now });

  // 1. Default listReported returns all active reports
  const defaultList = await service.listReported();
  assert.equal(defaultList.items.length, 2);
  assert.equal(defaultList.items[0].review.customerName, "Tanvi P."); // Privacy-safe masked name
  assert.equal(defaultList.items[0].review.verifiedBadge, "VERIFIED_ORDER");
  assert.equal(defaultList.items[1].review.customerName, "Rahul S.");
  assert.equal(defaultList.items[1].review.verifiedBadge, "ATTENDED_EVENT");

  // 2. Filter by type: FOOD
  const foodOnly = await service.listReported({ type: "FOOD" });
  assert.equal(foodOnly.items.length, 1);
  assert.equal(foodOnly.items[0].reviewId, "rev-food-1");

  // 3. Filter by type: EXPERIENCE
  const expOnly = await service.listReported({ type: "EXPERIENCE" });
  assert.equal(expOnly.items.length, 1);
  assert.equal(expOnly.items[0].reviewId, "rev-exp-1");
});

test("keep action preserves published visibility and resolves report", async () => {
  const reviews = [
    {
      id: "rev-1",
      cookId: "cook-1",
      rating: 5,
      comment: "Delicious biryani!",
      status: "PUBLISHED",
      isReported: true,
      dishId: "dish-1",
      createdAt: now,
    },
  ];

  const reports = [
    {
      id: "rep-1",
      reviewId: "rev-1",
      cookId: "cook-1",
      reason: "Accidental flag by cook",
      status: "ACTIVE",
      createdAt: now,
      review: reviews[0],
    },
  ];

  const { db, calls } = makeDb({ reviews, reports });
  const service = createReviewsService(db, { now: () => now });

  // Keep review
  const result = await service.moderate("admin-user-1", "rev-1", {
    action: "KEEP",
    reason: "Report reviewed and dismissed - review is valid.",
  });

  // Verify review remains PUBLISHED and isReported is false
  assert.equal(result.status, "PUBLISHED");
  assert.equal(result.isReported, false);
  assert.equal(reviews[0].status, "PUBLISHED");
  assert.equal(reviews[0].isReported, false);

  // Verify report is resolved as KEPT
  assert.equal(reports[0].status, "KEPT");
  assert.equal(reports[0].resolvedByAdminId, "admin-user-1");

  // Verify audit log
  assert.equal(calls.moderationLogs.length, 1);
  assert.equal(calls.moderationLogs[0].action, "KEPT");
  assert.equal(calls.moderationLogs[0].adminUserId, "admin-user-1");
  assert.equal(calls.moderationLogs[0].reviewId, "rev-1");

  // Verify public list still includes the review
  const publicList = await service.publicList({ dishId: "dish-1" });
  assert.equal(publicList.items.length, 1);
  assert.equal(publicList.ratingSummary.count, 1);
  assert.equal(publicList.ratingSummary.average, 5);
});

test("hide action removes review from public lists and rating aggregates", async () => {
  const reviews = [
    {
      id: "rev-good",
      cookId: "cook-1",
      rating: 5,
      status: "PUBLISHED",
      dishId: "dish-1",
      createdAt: now,
    },
    {
      id: "rev-inappropriate",
      cookId: "cook-1",
      rating: 1,
      comment: "Inappropriate review text",
      status: "PUBLISHED",
      isReported: true,
      dishId: "dish-1",
      createdAt: now,
    },
  ];

  const reports = [
    {
      id: "rep-1",
      reviewId: "rev-inappropriate",
      cookId: "cook-1",
      reason: "Profanity and false claims",
      status: "ACTIVE",
      createdAt: now,
      review: reviews[1],
    },
  ];

  const cooks = [{ id: "cook-1", userId: "user-cook-1" }];

  const { db, calls } = makeDb({ reviews, reports, cooks });
  const service = createReviewsService(db, { now: () => now });

  // Pre-check: public average of 2 reviews: (5 + 1) / 2 = 3.0
  const beforeList = await service.publicList({ dishId: "dish-1" });
  assert.equal(beforeList.items.length, 2);
  assert.equal(beforeList.ratingSummary.count, 2);
  assert.equal(beforeList.ratingSummary.average, 3);

  // Moderate: HIDE review with reason
  const result = await service.moderate("admin-user-1", "rev-inappropriate", {
    action: "HIDE",
    reason: "Review contains profanity and violates content policy.",
  });

  assert.equal(result.status, "HIDDEN");
  assert.equal(result.isReported, false);
  assert.equal(reviews[1].status, "HIDDEN");
  assert.equal(reports[0].status, "HIDDEN");

  // Verify audit log record
  assert.equal(calls.moderationLogs.length, 1);
  assert.equal(calls.moderationLogs[0].action, "HIDDEN");
  assert.equal(calls.moderationLogs[0].reason, "Review contains profanity and violates content policy.");

  // Post-check: public list must exclude HIDDEN review and count only PUBLISHED reviews
  const afterList = await service.publicList({ dishId: "dish-1" });
  assert.equal(afterList.items.length, 1);
  assert.equal(afterList.items[0].id, "rev-good");
  assert.equal(afterList.ratingSummary.count, 1);
  assert.equal(afterList.ratingSummary.average, 5); // 1-star review no longer drags down average!
});

test("validation enforces required reason between 5 and 500 characters when hiding a review", async () => {
  const { db } = makeDb({
    reviews: [{ id: "rev-1", cookId: "cook-1", status: "PUBLISHED", isReported: true }],
    reports: [{ id: "rep-1", reviewId: "rev-1", status: "ACTIVE" }],
  });
  const service = createReviewsService(db, { now: () => now });

  // 1. Zod schema validation
  const invalidShort = moderateReviewSchema.body.safeParse({ action: "HIDE", reason: "bad" });
  assert.equal(invalidShort.success, false);

  const invalidMissing = moderateReviewSchema.body.safeParse({ action: "HIDE" });
  assert.equal(invalidMissing.success, false);

  const validHide = moderateReviewSchema.body.safeParse({
    action: "HIDE",
    reason: "Contains inappropriate spam link",
  });
  assert.equal(validHide.success, true);

  const validKeepNoReason = moderateReviewSchema.body.safeParse({ action: "KEEP" });
  assert.equal(validKeepNoReason.success, true);

  // 2. Service level rejection if called with short reason on HIDE
  await assert.rejects(
    () => service.moderate("admin-1", "rev-1", { action: "HIDE", reason: "shrt" }),
    /A reason between 5 and 500 characters is required/
  );
});

test("multiple reports for one review are resolved atomically without affecting unrelated reports", async () => {
  const reviews = [
    {
      id: "rev-multi-report",
      cookId: "cook-1",
      status: "PUBLISHED",
      isReported: true,
      createdAt: now,
    },
    {
      id: "rev-unrelated",
      cookId: "cook-2",
      status: "PUBLISHED",
      isReported: true,
      createdAt: now,
    },
  ];

  const reports = [
    {
      id: "rep-1",
      reviewId: "rev-multi-report",
      cookId: "cook-1",
      reason: "First cook report",
      status: "ACTIVE",
      createdAt: now,
    },
    {
      id: "rep-2",
      reviewId: "rev-multi-report",
      cookId: "cook-1",
      reason: "Second cook report",
      status: "ACTIVE",
      createdAt: now,
    },
    {
      id: "rep-unrelated",
      reviewId: "rev-unrelated",
      cookId: "cook-2",
      reason: "Unrelated report",
      status: "ACTIVE",
      createdAt: now,
    },
  ];

  const { db } = makeDb({ reviews, reports });
  const service = createReviewsService(db, { now: () => now });

  // Moderate rev-multi-report as HIDE
  await service.moderate("admin-1", "rev-multi-report", {
    action: "HIDE",
    reason: "Multiple violations confirmed by admin inspection.",
  });

  // Both reports for rev-multi-report must be HIDDEN
  assert.equal(reports[0].status, "HIDDEN");
  assert.equal(reports[0].resolvedByAdminId, "admin-1");
  assert.equal(reports[1].status, "HIDDEN");
  assert.equal(reports[1].resolvedByAdminId, "admin-1");

  // Unrelated report MUST remain untouched (status: ACTIVE)
  assert.equal(reports[2].status, "ACTIVE");
  assert.equal(reports[2].resolvedByAdminId, undefined);
  assert.equal(reviews[1].status, "PUBLISHED");
  assert.equal(reviews[1].isReported, true);
});

test("query schema accepts status and type filters with pagination", () => {
  const parsed = adminReportedReviewsSchema.query.safeParse({
    page: "1",
    limit: "20",
    status: "ACTIVE",
    type: "FOOD",
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.page, 1);
  assert.equal(parsed.data.limit, 20);
  assert.equal(parsed.data.status, "ACTIVE");
  assert.equal(parsed.data.type, "FOOD");
});
