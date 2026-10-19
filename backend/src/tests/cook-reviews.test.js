import test from "node:test";
import assert from "node:assert/strict";
import { createReviewsService } from "../modules/reviews/reviews.service.js";
import { replySchema, reportSchema, cookReviewsSchema } from "../modules/reviews/reviews.validation.js";

const now = new Date("2026-10-17T12:00:00.000Z");

const makeDb = ({
  reviews = [],
  reports = [],
} = {}) => {
  const calls = { updates: [], createdReports: [], notifications: [] };

  const transaction = {
    review: {
      findFirst: async ({ where }) => {
        return reviews.find((r) => {
          if (where.id && r.id !== where.id) return false;
          if (where.cookId && r.cookId !== where.cookId) return false;
          return true;
        }) || null;
      },
      findUnique: async ({ where }) => {
        return reviews.find((r) => r.id === where.id) || null;
      },
      findMany: async ({ where, skip = 0, take = 20, orderBy }) => {
        return reviews.filter((r) => {
          if (where.cookId && r.cookId !== where.cookId) return false;
          if (where.reviewType && r.reviewType !== where.reviewType) return false;
          if (where.cookReply === null && r.cookReply !== null) return false;
          if (where.cookReply?.not !== undefined && r.cookReply === null) return false;
          return true;
        }).slice(skip, skip + take);
      },
      count: async ({ where }) => {
        return reviews.filter((r) => {
          if (where.cookId && r.cookId !== where.cookId) return false;
          if (where.reviewType && r.reviewType !== where.reviewType) return false;
          if (where.cookReply === null && r.cookReply !== null) return false;
          if (where.cookReply?.not !== undefined && r.cookReply === null) return false;
          return true;
        }).length;
      },
      updateMany: async (args) => {
        calls.updates.push(args);
        const matching = reviews.filter((r) => {
          if (args.where.id && r.id !== args.where.id) return false;
          if (args.where.cookId && r.cookId !== args.where.cookId) return false;
          if (args.where.cookReply === null && r.cookReply !== null) return false;
          if (args.where.status && r.status !== args.where.status) return false;
          if (args.where.isReported !== undefined && r.isReported !== args.where.isReported) return false;
          return true;
        });
        for (const item of matching) {
          Object.assign(item, args.data);
        }
        return { count: matching.length };
      },
    },
    reviewReport: {
      create: async ({ data }) => {
        const report = { id: `report-${Date.now()}`, status: "ACTIVE", ...data };
        calls.createdReports.push(report);
        reports.push(report);
        return report;
      },
    },
    user: {
      findMany: async () => [{ id: "admin-1" }],
    },
    platformNotification: {
      upsert: async (args) => {
        calls.notifications.push(args.create);
        return args.create;
      },
    },
    userNotification: {
      upsert: async (args) => {
        calls.notifications.push(args.create);
        return args.create;
      },
    },
  };

  const database = {
    ...transaction,
    $transaction: async (callback) => callback(transaction),
  };

  return { database, calls, reviews, reports };
};

test("cook sees only their own reviews in listForCook", async () => {
  const reviews = [
    {
      id: "rev-cook1-1",
      cookId: "cook-1",
      reviewType: "FOOD",
      rating: 5,
      comment: "Delicious!",
      status: "PUBLISHED",
      cookReply: null,
      createdAt: now,
      customer: { name: "Aarav Sharma" },
      dish: { name: "Biryani" },
      order: { status: "DELIVERED" },
    },
    {
      id: "rev-cook1-2",
      cookId: "cook-1",
      reviewType: "FOOD",
      rating: 4,
      comment: "Good taste",
      status: "PUBLISHED",
      cookReply: "Thank you!",
      createdAt: now,
      customer: { name: "Divya Patel" },
      dish: { name: "Paneer" },
      order: { status: "DELIVERED" },
    },
    {
      id: "rev-cook2-1",
      cookId: "cook-2",
      reviewType: "FOOD",
      rating: 3,
      comment: "Average",
      status: "PUBLISHED",
      cookReply: null,
      createdAt: now,
      customer: { name: "Suresh Rao" },
      dish: { name: "Dosa" },
      order: { status: "DELIVERED" },
    },
  ];

  const { database } = makeDb({ reviews });
  const service = createReviewsService(database, { now: () => now });

  const result1 = await service.listForCook("cook-1");
  assert.equal(result1.items.length, 2);
  assert.ok(result1.items.every((i) => i.cookId === "cook-1"));
  assert.equal(result1.pagination.total, 2);

  const result2 = await service.listForCook("cook-2");
  assert.equal(result2.items.length, 1);
  assert.equal(result2.items[0].id, "rev-cook2-1");
  assert.equal(result2.pagination.total, 1);
});

test("listForCook filters by food, events, and needsReply correctly", async () => {
  const reviews = [
    { id: "r1", cookId: "c1", reviewType: "FOOD", rating: 5, cookReply: null, createdAt: now, customer: { name: "User 1" }, dish: { name: "Dish" }, order: { status: "DELIVERED" } },
    { id: "r2", cookId: "c1", reviewType: "FOOD", rating: 4, cookReply: "Thanks", createdAt: now, customer: { name: "User 2" }, dish: { name: "Dish" }, order: { status: "DELIVERED" } },
    { id: "r3", cookId: "c1", reviewType: "EXPERIENCE", rating: 5, cookReply: null, createdAt: now, customer: { name: "User 3" }, experienceBooking: { status: "COMPLETED" } },
    { id: "r4", cookId: "c1", reviewType: "EXPERIENCE", rating: 5, cookReply: "Glad you joined", createdAt: now, customer: { name: "User 4" }, experienceBooking: { status: "COMPLETED" } },
  ];

  const { database } = makeDb({ reviews });
  const service = createReviewsService(database, { now: () => now });

  // Filter: Food
  const food = await service.listForCook("c1", { type: "FOOD" });
  assert.equal(food.items.length, 2);
  assert.ok(food.items.every((r) => r.reviewType === "FOOD"));

  // Filter: Events
  const events = await service.listForCook("c1", { type: "EXPERIENCE" });
  assert.equal(events.items.length, 2);
  assert.ok(events.items.every((r) => r.reviewType === "EXPERIENCE"));

  // Filter: Needs Reply (needsReply === "true")
  const needsReply = await service.listForCook("c1", { needsReply: "true" });
  assert.equal(needsReply.items.length, 2);
  assert.deepEqual(needsReply.items.map((r) => r.id).sort(), ["r1", "r3"]);

  // Filter: Already Replied (needsReply === "false")
  const replied = await service.listForCook("c1", { needsReply: "false" });
  assert.equal(replied.items.length, 2);
  assert.deepEqual(replied.items.map((r) => r.id).sort(), ["r2", "r4"]);
});

test("cook reply succeeds once and rejects a second reply or wrong cook ownership", async () => {
  const review = {
    id: "rev-1",
    cookId: "cook-1",
    customerId: "cust-1",
    rating: 5,
    status: "PUBLISHED",
    cookReply: null,
    cookRepliedAt: null,
  };

  const { database, calls } = makeDb({ reviews: [review] });
  const service = createReviewsService(database, { now: () => now });

  // First reply succeeds
  const replyResult = await service.reply("cook-1", "rev-1", "Thank you for the warm feedback!");
  assert.equal(review.cookReply, "Thank you for the warm feedback!");
  assert.ok(review.cookRepliedAt);
  assert.equal(calls.updates[0].where.cookId, "cook-1");

  // Notification sent to customer
  const custNotification = calls.notifications.find((n) => n.userId === "cust-1");
  assert.ok(custNotification);
  assert.equal(custNotification.portal, "CUSTOMER");
  assert.match(custNotification.title, /replied to your review/i);

  // Second reply attempt is rejected with 409 conflict
  await assert.rejects(
    service.reply("cook-1", "rev-1", "A second reply attempt"),
    { statusCode: 409, message: /already been submitted/i }
  );

  // Unauthorized cook cannot reply to another cook's review
  await assert.rejects(
    service.reply("cook-unauthorized", "rev-1", "Unauthorized reply"),
    { statusCode: 404 }
  );
});

test("reply length validation enforces 1 to 300 characters", () => {
  const validEmptyParam = replySchema.params.safeParse({ id: "rev-1" });
  assert.equal(validEmptyParam.success, true);

  // Exactly 300 characters
  const max300 = "a".repeat(300);
  assert.equal(replySchema.body.safeParse({ reply: max300 }).success, true);

  // 301 characters fails
  const over300 = "a".repeat(301);
  assert.equal(replySchema.body.safeParse({ reply: over300 }).success, false);

  // Empty string or whitespace fails
  assert.equal(replySchema.body.safeParse({ reply: "" }).success, false);
  assert.equal(replySchema.body.safeParse({ reply: "   " }).success, false);
});

test("cook report records report without hiding or deleting review", async () => {
  const review = {
    id: "rev-reportable",
    cookId: "cook-1",
    rating: 1,
    status: "PUBLISHED",
    isReported: false,
    reportReason: null,
  };

  const { database, calls, reports } = makeDb({ reviews: [review] });
  const service = createReviewsService(database, { now: () => now });

  const reportResult = await service.report("cook-1", "rev-reportable", "This review contains irrelevant accusations.");
  assert.equal(reportResult.status, "ACTIVE");
  assert.equal(reports.length, 1);
  assert.equal(reports[0].reason, "This review contains irrelevant accusations.");

  // Review status is NOT changed to HIDDEN or REMOVED
  assert.equal(review.status, "PUBLISHED");
  assert.equal(review.isReported, true);
  assert.equal(review.reportReason, "This review contains irrelevant accusations.");

  // Admin notification was sent
  const adminNotification = calls.notifications.find((n) => n.title.includes("reported"));
  assert.ok(adminNotification);

  // Duplicate report rejects with 409
  await assert.rejects(
    service.report("cook-1", "rev-reportable", "Another report attempt"),
    { statusCode: 409, message: /already has an active report|already been reported/i }
  );

  // Unauthorized cook cannot report another cook's review
  await assert.rejects(
    service.report("cook-unauthorized", "rev-reportable", "Trying to report someone else's review"),
    { statusCode: 404 }
  );
});

test("report reason validation enforces 5 to 500 characters", () => {
  // Exactly 5 characters passes
  assert.equal(reportSchema.body.safeParse({ reason: "12345" }).success, true);

  // Exactly 500 characters passes
  assert.equal(reportSchema.body.safeParse({ reason: "a".repeat(500) }).success, true);

  // 4 characters fails
  assert.equal(reportSchema.body.safeParse({ reason: "1234" }).success, false);

  // 501 characters fails
  assert.equal(reportSchema.body.safeParse({ reason: "a".repeat(501) }).success, false);
});

test("hidden and removed reviews cannot be replied to or reported by the cook", async () => {
  const hiddenReview = { id: "rev-hidden", cookId: "cook-1", rating: 1, status: "HIDDEN", cookReply: null, isReported: false };
  const removedReview = { id: "rev-removed", cookId: "cook-1", rating: 1, status: "REMOVED", cookReply: null, isReported: false };

  const { database } = makeDb({ reviews: [hiddenReview, removedReview] });
  const service = createReviewsService(database, { now: () => now });

  // Replying to hidden or removed reviews is rejected
  await assert.rejects(
    service.reply("cook-1", "rev-hidden", "Reply to hidden"),
    { statusCode: 409, message: /only to a visible review/i }
  );
  await assert.rejects(
    service.reply("cook-1", "rev-removed", "Reply to removed"),
    { statusCode: 409, message: /only to a visible review/i }
  );

  // Reporting hidden or removed reviews is rejected
  await assert.rejects(
    service.report("cook-1", "rev-hidden", "Reporting hidden review"),
    { statusCode: 409, message: /only visible reviews can be reported/i }
  );
  await assert.rejects(
    service.report("cook-1", "rev-removed", "Reporting removed review"),
    { statusCode: 409, message: /only visible reviews can be reported/i }
  );
});
