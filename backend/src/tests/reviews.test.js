import test from "node:test";
import assert from "node:assert/strict";
import { createReviewsService } from "../modules/reviews/reviews.service.js";
import { createReviewSchema, pendingReviewsSchema, reportSchema, replySchema } from "../modules/reviews/reviews.validation.js";
import { notifyOrderStatusChanged } from "../modules/notifications/order-lifecycle.producers.js";

const now = new Date("2026-10-17T12:00:00.000Z");
const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
const foodItem = (overrides = {}) => ({
  id: "item-1", dishId: "dish-1", name: "Saved dish name", dish: { id: "dish-1", name: "Dish" }, review: null,
  order: {
    id: "order-1", orderNumber: "TB-1", customerId: "customer-1", cookId: "cook-1", cookName: "Cook",
    status: "DELIVERED", paymentStatus: "PENDING", checkoutId: "checkout-1",
    cook: { id: "cook-1", businessName: "Kitchen", userId: "cook-user" },
    statusHistory: [{ changedAt: recent }],
  }, ...overrides,
});

const makeDb = ({ item = foodItem(), booking, initialReview, initialMine, createResult = { id: "review-1" }, notifierError = null } = {}) => {
  const calls = { created: [], notifications: [], updates: [], moderation: [] };
  const transaction = {
    orderItem: { findFirst: async ({ where }) => item && item.id === where.id && item.order?.customerId === where.order?.customerId ? item : null },
    experienceBooking: { findFirst: async ({ where }) => booking && booking.id === where.id && booking.customerId === where.customerId ? booking : null, findMany: async () => [] },
    review: {
      create: async ({ data }) => { calls.created.push(data); return createResult; },
      findFirst: async () => initialReview,
      findUnique: async ({ where }) => ({ id: where.id, rating: 4, comment: "updated" }),
      updateMany: async (args) => { calls.updates.push(args); return { count: initialReview?.updatedCount ?? 1 }; },
      update: async ({ where, data }) => ({ id: where.id, ...data }),
      findMany: async () => initialMine || [],
      count: async () => (initialMine || []).length,
      aggregate: async () => ({ _avg: { rating: 4 }, _count: { _all: 4 } }),
    },
    cookProfile: { findUnique: async () => ({ userId: "cook-user" }) },
    userNotification: { upsert: async ({ create }) => { if (notifierError) throw notifierError; calls.notifications.push(create); return create; } },
    platformNotification: { upsert: async () => ({}) },
    user: { findMany: async () => [] },
    reviewReport: { create: async ({ data }) => ({ id: "report-1", status: "ACTIVE", ...data }), findFirst: async () => null, findMany: async () => [], count: async () => 0, update: async () => ({}) },
    reviewModerationLog: { create: async ({ data }) => { calls.moderation.push(data); return data; } },
  };
  const database = {
    ...transaction,
    dish: { findFirst: async () => ({ id: "dish-1" }) },
    cookProfile: { findFirst: async () => ({ id: "cook-1" }), findUnique: transaction.cookProfile.findUnique },
    orderItem: transaction.orderItem,
    experienceBooking: transaction.experienceBooking,
    review: transaction.review,
    reviewReport: transaction.reviewReport,
    $transaction: async (callback) => callback(transaction),
  };
  return { database, calls };
};

test("eligible delivered food review persists per order item and notifies only its cook", async () => {
  const { database, calls } = makeDb();
  const result = await createReviewsService(database, { now: () => now }).create("customer-1", { reviewType: "FOOD", orderItemId: "item-1", rating: 5 });
  assert.equal(result.id, "review-1");
  assert.deepEqual(calls.created[0], {
    reviewType: "FOOD", orderId: "order-1", orderItemId: "item-1", customerId: "customer-1", cookId: "cook-1", dishId: "dish-1", subjectNameSnapshot: "Dish", cookNameSnapshot: "Kitchen", rating: 5, comment: null,
  });
  assert.equal(calls.notifications[0].userId, "cook-user");
  assert.equal(calls.notifications[0].portal, "COOK");
  assert.match(calls.notifications[0].eventKey, /^review:review-1:created:cook:/);
});

test("food review rejects missing ownership, undelivered orders, missing delivery history, expired windows, and duplicate item reviews", async () => {
  for (const item of [null, foodItem({ order: { ...foodItem().order, customerId: "another-customer" } }), foodItem({ order: { ...foodItem().order, status: "PREPARING" } }), foodItem({ order: { ...foodItem().order, statusHistory: [] } }), foodItem({ order: { ...foodItem().order, statusHistory: [{ changedAt: new Date(now.getTime() - 15 * 86400000) }] } }), foodItem({ review: { id: "existing" } })]) {
    const { database } = makeDb({ item });
    await assert.rejects(createReviewsService(database, { now: () => now }).create("customer-1", { reviewType: "FOOD", orderItemId: "item-1", rating: 5 }));
  }
});

test("COD delivery may be reviewed while collection remains pending, but failed/refunded states are rejected", async () => {
  const { database } = makeDb();
  await createReviewsService(database, { now: () => now }).create("customer-1", { reviewType: "FOOD", orderItemId: "item-1", rating: 4 });
  for (const paymentStatus of ["FAILED", "REFUNDED"]) {
    const db = makeDb({ item: foodItem({ order: { ...foodItem().order, paymentStatus } }) }).database;
    await assert.rejects(createReviewsService(db, { now: () => now }).create("customer-1", { reviewType: "FOOD", orderItemId: "item-1", rating: 4 }));
  }
});

test("event reviews fail closed because completed bookings have no authoritative completion timestamp", async () => {
  const booking = { id: "booking-1", customerId: "customer-1", status: "COMPLETED", bookingDate: recent, review: null, experience: { cookId: "cook-1", title: "Dining event", cook: { businessName: "Kitchen", userId: "cook-user" } } };
  const db = makeDb({ booking });
  await assert.rejects(
    createReviewsService(db.database, { now: () => now }).create("customer-1", { reviewType: "EXPERIENCE", bookingId: "booking-1", rating: 5 }),
    { statusCode: 503, message: /authoritative completion time/ },
  );
  assert.equal(db.calls.created.length, 0);
  for (const invalid of [null, { ...booking, customerId: "other" }, { ...booking, status: "CONFIRMED" }]) {
    const database = makeDb({ booking: invalid }).database;
    await assert.rejects(createReviewsService(database, { now: () => now }).create("customer-1", { reviewType: "EXPERIENCE", bookingId: "booking-1", rating: 5 }));
  }
});

test("pending review items include only validated public image and kitchen fields for food and events", async () => {
  const { database } = makeDb();
  const food = foodItem({
    dish: { id: "dish-1", name: "Dish", image: "https://images.example.com/dish.jpg", phone: "private" },
    order: { ...foodItem().order, cook: { businessName: "Kitchen One", profileImage: "https://images.example.com/kitchen.jpg", email: "private" } },
  });
  const event = {
    id: "booking-2", experienceId: "experience-2", customerId: "customer-1", status: "COMPLETED", completedAt: recent,
    experience: {
      title: "Cooking event", image: null, photos: ["https://images.example.com/event.jpg", "https://images.example.com/second.jpg"],
      cook: { businessName: "Kitchen Two", profileImage: "https://images.example.com/kitchen-two.jpg", phone: "private" },
    },
  };
  database.orderItem.findMany = async ({ include }) => {
    assert.equal(include.dish.select.image, true);
    assert.equal(include.order.select.cook.select.profileImage, true);
    return [food];
  };
  database.experienceBooking.findMany = async ({ include }) => {
    assert.equal(include.experience.select.image, true);
    assert.equal(include.experience.select.photos, true);
    assert.equal(include.experience.select.cook.select.businessName, true);
    return [event];
  };

  const result = await createReviewsService(database, { now: () => now }).listPending("customer-1", { page: 1, limit: 50 });
  const foodResult = result.items.find((item) => item.reviewType === "FOOD");
  const eventResult = result.items.find((item) => item.reviewType === "EXPERIENCE");
  assert.deepEqual([
    foodResult.dishImageUrl, foodResult.experienceImageUrl, foodResult.kitchenName, foodResult.kitchenPhotoUrl,
  ], ["https://images.example.com/dish.jpg", null, "Kitchen One", "https://images.example.com/kitchen.jpg"]);
  assert.deepEqual([
    eventResult.dishImageUrl, eventResult.experienceImageUrl, eventResult.kitchenName, eventResult.kitchenPhotoUrl,
  ], [null, "https://images.example.com/event.jpg", "Kitchen Two", "https://images.example.com/kitchen-two.jpg"]);
  for (const item of result.items) {
    for (const privateField of ["email", "phone", "address", "isReported", "reportReason", "paymentDetails", "fssai"]) {
      assert.equal(privateField in item, false);
    }
  }
});

test("cook review list includes only the approved public thumbnail and kitchen fields", async () => {
  const food = {
    id: "food-review", reviewType: "FOOD", rating: 5, status: "PUBLISHED", createdAt: recent,
    subjectNameSnapshot: "Dish", customer: { name: "Customer Name" }, dish: { name: "Dish", image: "https://cdn.foodimages.com/dish.jpg" },
    order: { orderNumber: "TB-FOOD", status: "DELIVERED", cook: { businessName: "Food Kitchen", profileImage: "https://cdn.foodimages.com/kitchen.jpg", phone: "private" } },
  };
  const event = {
    id: "event-review", reviewType: "EXPERIENCE", rating: 4, status: "PUBLISHED", createdAt: recent,
    subjectNameSnapshot: "Workshop", customer: { name: "Another Customer" },
    experienceBooking: { id: "booking-1", status: "COMPLETED", experience: { image: null, photos: ["https://cdn.eventimages.com/poster.jpg"], cook: { businessName: "Event Kitchen", profileImage: "https://cdn.eventimages.com/kitchen.jpg", email: "private" } } },
  };
  const { database } = makeDb();
  database.review.findMany = async ({ select }) => {
    assert.equal(select.dish.select.image, true);
    assert.equal(select.order.select.cook.select.profileImage, true);
    assert.equal(select.experienceBooking.select.experience.select.photos, true);
    return [food, event];
  };
  database.review.count = async () => 2;

  const result = await createReviewsService(database, { now: () => now }).listForCook("cook-1");
  assert.deepEqual(
    [result.items[0].dishImageUrl, result.items[0].experienceImageUrl, result.items[0].kitchenName, result.items[0].kitchenPhotoUrl],
    ["https://cdn.foodimages.com/dish.jpg", null, "Food Kitchen", "https://cdn.foodimages.com/kitchen.jpg"],
  );
  assert.deepEqual(
    [result.items[1].dishImageUrl, result.items[1].experienceImageUrl, result.items[1].kitchenName, result.items[1].kitchenPhotoUrl],
    [null, "https://cdn.eventimages.com/poster.jpg", "Event Kitchen", "https://cdn.eventimages.com/kitchen.jpg"],
  );
  assert.equal("phone" in result.items[0], false);
  assert.equal("email" in result.items[1], false);
  assert.equal("image" in result.items[0].dish, false);
  assert.equal("cook" in result.items[0].order, false);
  assert.equal("experience" in result.items[1].experienceBooking, false);
});

test("pending review public fields are null when image URLs or kitchen names are invalid", async () => {
  const { database } = makeDb();
  database.orderItem.findMany = async () => [foodItem({
    dish: { id: "dish-1", name: "Dish", image: "http://images.example.com/dish.jpg" },
    order: { ...foodItem().order, cook: { businessName: "  \u0001 ", profileImage: "https://127.0.0.1/kitchen.jpg" } },
  })];
  database.experienceBooking.findMany = async () => [];

  const result = await createReviewsService(database, { now: () => now }).listPending("customer-1", { page: 1, limit: 50 });
  assert.deepEqual([
    result.items[0].dishImageUrl, result.items[0].experienceImageUrl, result.items[0].kitchenName, result.items[0].kitchenPhotoUrl,
  ], [null, null, null, null]);
});

test("customer submitted review fields include validated public media without exposing moderation or account data", async () => {
  const review = {
    id: "review-1", reviewType: "FOOD", rating: 4, comment: "Good", status: "PUBLISHED",
    subjectNameSnapshot: "Saved dish", cookNameSnapshot: "Cook snapshot", cookReply: "Thanks", cookRepliedAt: recent,
    createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), dish: { name: "Dish", image: "https://images.example.com/dish.jpg" },
    cook: { businessName: "Kitchen", profileImage: "https://images.example.com/kitchen.jpg", email: "private" },
    isReported: true, reportReason: "private moderation data", customer: { email: "private" },
  };
  const { database } = makeDb({ initialMine: [review] });
  database.review.findMany = async ({ select }) => {
    assert.equal(select.dish.select.image, true);
    assert.equal(select.cook.select.profileImage, true);
    assert.equal(select.isReported, undefined);
    assert.equal(select.reportReason, undefined);
    assert.equal(select.customer, undefined);
    return [review];
  };

  const result = await createReviewsService(database, { now: () => now }).listMine("customer-1", { page: 1, limit: 50 });
  assert.deepEqual([
    result.items[0].dishImageUrl, result.items[0].experienceImageUrl, result.items[0].kitchenName, result.items[0].kitchenPhotoUrl,
  ], ["https://images.example.com/dish.jpg", null, "Kitchen", "https://images.example.com/kitchen.jpg"]);
  assert.equal(result.items[0].cookName, "Cook snapshot");
  assert.equal(result.items[0].cookReply, "Thanks");
  assert.equal(result.items[0].editable, true);
  for (const privateField of ["email", "phone", "address", "isReported", "reportReason", "customer"]) {
    assert.equal(privateField in result.items[0], false);
  }
});

test("submitted event reviews use the Experience image fallback and null invalid or unavailable public fields", async () => {
  const reviews = [
    {
      id: "event-review", reviewType: "EXPERIENCE", rating: 5, comment: null, status: "HIDDEN",
      subjectNameSnapshot: "Cooking class", cookNameSnapshot: "Legacy cook name", cookReply: null,
      createdAt: recent, experienceBooking: { experience: { image: "", photos: ["https://images.example.com/event.jpg"] } },
      cook: { businessName: "Kitchen", profileImage: "http://images.example.com/private.jpg", phone: "private" },
      isReported: true, reportReason: "private",
    },
    {
      id: "invalid-review", reviewType: "FOOD", rating: 3, status: "REMOVED", createdAt: recent,
      dish: { name: "Dish", image: "https://localhost/dish.jpg" },
      cook: { businessName: " \u0001 ", profileImage: null },
    },
  ];
  const { database } = makeDb();
  database.review.findMany = async ({ select }) => {
    assert.equal(select.experienceBooking.select.experience.select.image, true);
    assert.equal(select.experienceBooking.select.experience.select.photos, true);
    assert.equal(select.isReported, undefined);
    assert.equal(select.reportReason, undefined);
    return reviews;
  };

  const result = await createReviewsService(database, { now: () => now }).listMine("customer-1", { page: 1, limit: 50 });
  const event = result.items.find((item) => item.id === "event-review");
  const invalid = result.items.find((item) => item.id === "invalid-review");
  assert.deepEqual([
    event.dishImageUrl, event.experienceImageUrl, event.kitchenName, event.kitchenPhotoUrl,
  ], [null, "https://images.example.com/event.jpg", "Kitchen", null]);
  assert.deepEqual([
    invalid.dishImageUrl, invalid.experienceImageUrl, invalid.kitchenName, invalid.kitchenPhotoUrl,
  ], [null, null, null, null]);
  assert.equal(event.cookName, "Legacy cook name");
  for (const item of result.items) {
    for (const privateField of ["phone", "email", "address", "documents", "paymentDetails", "fssai", "isReported", "reportReason"]) {
      assert.equal(privateField in item, false);
    }
  }
});

test("14-day delivery eligibility includes the exact boundary but excludes a delivery just before it", async () => {
  const boundary = new Date(now.getTime() - 14 * 86400000);
  const { database: eligibleDb } = makeDb({ item: foodItem({ order: { ...foodItem().order, statusHistory: [{ changedAt: boundary }] } }) });
  await createReviewsService(eligibleDb, { now: () => now }).create("customer-1", { reviewType: "FOOD", orderItemId: "item-1", rating: 5 });
  const { database: expiredDb } = makeDb({ item: foodItem({ order: { ...foodItem().order, statusHistory: [{ changedAt: new Date(boundary.getTime() - 1) }] } }) });
  await assert.rejects(createReviewsService(expiredDb, { now: () => now }).create("customer-1", { reviewType: "FOOD", orderItemId: "item-1", rating: 5 }), { statusCode: 409 });
});

test("concurrent duplicate submissions are mapped to a conflict by the database uniqueness guard", async () => {
  const { database, calls } = makeDb();
  let created = false;
  database.$transaction = async (callback) => callback({
    ...database,
    orderItem: database.orderItem,
    cookProfile: database.cookProfile,
    userNotification: database.userNotification,
    review: {
      ...database.review,
      create: async (args) => {
        await new Promise((resolve) => setImmediate(resolve));
        if (created) { const error = new Error("unique constraint"); error.code = "P2002"; throw error; }
        created = true;
        calls.created.push(args.data);
        return { id: "review-1" };
      },
    },
  });
  const service = createReviewsService(database, { now: () => now });
  const results = await Promise.allSettled([
    service.create("customer-1", { reviewType: "FOOD", orderItemId: "item-1", rating: 5 }),
    service.create("customer-1", { reviewType: "FOOD", orderItemId: "item-1", rating: 4 }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason.statusCode === 409).length, 1);
  assert.equal(calls.created.length, 1);
});

test("review edits are owner-scoped and expire at 24 hours", async () => {
  const review = { id: "review-1", createdAt: new Date(now.getTime() - 23 * 3600000), status: "PUBLISHED" };
  const db = makeDb({ initialReview: review });
  const service = createReviewsService(db.database, { now: () => now });
  assert.equal((await service.update("customer-1", "review-1", { rating: 4 })).id, "review-1");
  const expiredDb = makeDb({ initialReview: { ...review, createdAt: new Date(now.getTime() - 25 * 3600000) } });
  await assert.rejects(createReviewsService(expiredDb.database, { now: () => now }).update("customer-1", "review-1", { rating: 4 }));
  const noOwner = makeDb({ initialReview: null });
  await assert.rejects(createReviewsService(noOwner.database, { now: () => now }).update("other", "review-1", { rating: 4 }), { statusCode: 404 });
});

test("cook reply is ownership-scoped, single-submit, and notifies the customer transactionally", async () => {
  const { database, calls } = makeDb({ initialReview: { id: "review-1", customerId: "customer-1", cookReply: null, status: "PUBLISHED" } });
  const service = createReviewsService(database, { now: () => now });
  await service.reply("cook-1", "review-1", "Thank you for the feedback.");
  assert.equal(calls.updates[0].where.cookId, "cook-1");
  assert.match(calls.notifications[0].eventKey, /^review:review-1:replied:customer:/);
  const wrongOwner = makeDb({ initialReview: null });
  await assert.rejects(createReviewsService(wrongOwner.database).reply("other-cook", "review-1", "reply"), { statusCode: 404 });
  const replied = makeDb({ initialReview: { id: "review-1", customerId: "customer-1", cookReply: "already replied", status: "PUBLISHED" } });
  await assert.rejects(createReviewsService(replied.database).reply("cook-1", "review-1", "second reply"), { statusCode: 409 });
});

test("cook report is recorded without hiding and duplicate attempts do not create another report", async () => {
  const { database, calls } = makeDb({ initialReview: { id: "review-1", cookId: "cook-1", status: "PUBLISHED", isReported: false, reportReason: null } });
  const result = await createReviewsService(database, { now: () => now }).report("cook-1", "review-1", "This does not relate to the dish.");
  assert.equal(result.status, "ACTIVE");
  assert.equal(calls.updates[0].data.isReported, true);
  assert.equal(calls.updates[0].data.status, undefined);
  const repeated = makeDb({ initialReview: { id: "review-1", cookId: "cook-1", status: "PUBLISHED", isReported: true, reportReason: "Already reported" } });
  await assert.rejects(createReviewsService(repeated.database).report("cook-1", "review-1", "Duplicate report"), { statusCode: 409 });
});

test("public review output includes only masked name and public fields; hidden reviews are filtered", async () => {
  const { database } = makeDb();
  database.review.findMany = async (args) => {
    assert.equal(args.where.status, "PUBLISHED");
    return [{ id: "review-1", reviewType: "FOOD", rating: 5, comment: "Nice", subjectNameSnapshot: "Dish", cookNameSnapshot: "Kitchen", createdAt: recent, customer: { name: "Tanavi Pandao", email: "private@example.test", phone: "secret" }, cook: { businessName: "Kitchen" } }];
  };
  const result = await createReviewsService(database).publicDishReviews("dish-1", { page: 1, limit: 20 });
  assert.equal(result.items[0].customerName, "Tanavi P.");
  assert.equal(result.items[0].verified, "VERIFIED_ORDER");
  assert.equal("email" in result.items[0], false);
  assert.equal("phone" in result.items[0], false);
  assert.equal(result.ratingSummary.count, 4);
});

test("review request notification is tied to a committed DELIVERED transition and has a deterministic key", async () => {
  const events = [];
  const transaction = { userNotification: { upsert: async ({ create }) => events.push(create) } };
  const order = { id: "order-9", orderNumber: "TB-9", customerId: "customer-9", cookId: "cook-9", checkoutId: "checkout-9" };
  await notifyOrderStatusChanged(transaction, { order, fromStatus: "OUT_FOR_DELIVERY", toStatus: "DELIVERED" });
  assert.equal(events.length, 2); // delivered status plus review request
  const request = events.find((event) => event.title === "Your review is welcome");
  assert.equal(request.userId, "customer-9");
  assert.equal(request.portal, "CUSTOMER");
  assert.equal(request.eventKey, "order:order-9:review-request:customer:customer-9");
  assert.equal(request.metadata.href, "/reviews?orderId=checkout-9");
});

test("review request validation rejects malformed targets, ratings, and oversized replies/reports", () => {
  assert.equal(pendingReviewsSchema.query.safeParse({ page: "1000", limit: "50" }).success, true);
  assert.equal(pendingReviewsSchema.query.safeParse({ page: "1001" }).success, false);
  assert.equal(pendingReviewsSchema.query.safeParse({ page: "0" }).success, false);
  assert.equal(createReviewSchema.body.safeParse({ reviewType: "FOOD", orderItemId: "item-1", rating: 5 }).success, true);
  assert.equal(createReviewSchema.body.safeParse({ reviewType: "FOOD", orderItemId: "item-1", bookingId: "booking-1", rating: 5 }).success, false);
  assert.equal(createReviewSchema.body.safeParse({ reviewType: "FOOD", orderItemId: "item-1", rating: 6 }).success, false);
  assert.equal(replySchema.body.safeParse({ reply: "r".repeat(301) }).success, false);
  assert.equal(reportSchema.body.safeParse({ reason: "no" }).success, false);
});
