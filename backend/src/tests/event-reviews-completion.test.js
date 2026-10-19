import test from "node:test";
import assert from "node:assert/strict";
import { createExperienceBookingsService } from "../modules/events/experience-bookings.service.js";
import { createReviewsService } from "../modules/reviews/reviews.service.js";

const now = new Date("2026-10-17T12:00:00.000Z");
const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // exactly 14 days ago

const makeBooking = (overrides = {}) => ({
  id: "booking-101",
  experienceId: "exp-1",
  customerId: "customer-101",
  bookingDate: new Date("2026-10-10T18:00:00.000Z"), // scheduled start date
  slotId: "slot-101",
  slot: {
    startsAt: new Date("2026-10-10T18:00:00.000Z"),
    endsAt: new Date("2026-10-10T20:00:00.000Z"),
  },
  numberOfGuests: 4,
  totalAmount: 2400,
  status: "CONFIRMED",
  completedAt: null,
  createdAt: new Date("2026-10-01T10:00:00.000Z"),
  updatedAt: new Date("2026-10-01T10:00:00.000Z"),
  review: null,
  customer: { id: "customer-101", name: "Ananya Sharma", email: "ananya@example.com" },
  experience: {
    id: "exp-1",
    cookId: "cook-101",
    title: "Heritage Kathiawadi Thali Workshop",
    cook: { id: "cook-101", businessName: "Alka's Rasoi", userId: "cook-user-101" },
  },
  ...overrides,
});

const makeMockDb = (initialBooking = makeBooking()) => {
  let currentBooking = { ...initialBooking };
  let transactionQueue = Promise.resolve();
  const calls = {
    createdReviews: [],
    notifications: [],
    bookingUpdates: [],
  };

  const tx = {
    experienceBooking: {
      findUnique: async ({ where }) => (currentBooking && currentBooking.id === where.id ? currentBooking : null),
      findFirst: async ({ where }) => {
        if (!currentBooking) return null;
        if (where.id && currentBooking.id !== where.id) return null;
        if (where.customerId && currentBooking.customerId !== where.customerId) return null;
        if (where.status && currentBooking.status !== where.status) return null;
        if (where.completedAt?.not === null && !currentBooking.completedAt) return null;
        if (where.experience?.cookId && currentBooking.experience?.cookId !== where.experience.cookId) return null;
        return currentBooking;
      },
      findMany: async ({ where = {} } = {}) => {
        if (!currentBooking) return [];
        if (where.customerId && currentBooking.customerId !== where.customerId) return [];
        if (where.experience?.cookId && currentBooking.experience?.cookId !== where.experience.cookId) return [];
        if (where.status && currentBooking.status !== where.status) return [];
        if (where.review === null && currentBooking.review !== null) return [];
        if (where.completedAt?.gte && currentBooking.completedAt < where.completedAt.gte) return [];
        if (where.completedAt?.lte && currentBooking.completedAt > where.completedAt.lte) return [];
        return [currentBooking];
      },
      update: async ({ where, data }) => {
        assert.equal(where.id, currentBooking.id);
        calls.bookingUpdates.push(data);
        currentBooking = { ...currentBooking, ...data, updatedAt: new Date() };
        return currentBooking;
      },
      updateMany: async ({ where, data }) => {
        if (!currentBooking || currentBooking.id !== where.id || currentBooking.status !== where.status || currentBooking.completedAt !== where.completedAt || currentBooking.experience?.cookId !== where.experience.cookId) return { count: 0 };
        calls.bookingUpdates.push(data);
        currentBooking = { ...currentBooking, ...data, updatedAt: new Date() };
        return { count: 1 };
      },
    },
    orderItem: {
      findMany: async () => [],
    },
    cookProfile: {
      findUnique: async () => ({ userId: currentBooking.experience?.cook?.userId || "cook-user-101" }),
    },
    review: {
      create: async ({ data }) => {
        calls.createdReviews.push(data);
        const newReview = { id: "review-event-1", ...data, createdAt: now };
        currentBooking.review = { id: newReview.id };
        return newReview;
      },
      findFirst: async () => currentBooking.review,
      findUnique: async ({ where }) => ({ id: where.id, rating: 5, comment: "Authentic and wonderful!" }),
    },
    userNotification: {
      upsert: async ({ create }) => {
        if (!calls.notifications.some((notification) => notification.eventKey === create.eventKey)) calls.notifications.push(create);
        return create;
      },
    },
  };

  const database = {
    ...tx,
    $transaction: (callback) => {
      const run = transactionQueue.then(async () => {
        const before = currentBooking && { ...currentBooking };
        try { return await callback(tx); }
        catch (error) { currentBooking = before; throw error; }
      });
      transactionQueue = run.then(() => undefined, () => undefined);
      return run;
    },
  };

  return { database, calls, getBooking: () => currentBooking };
};

test("past confirmed booking legitimately completes and sets authoritative completedAt", async () => {
  const { database, calls, getBooking } = makeMockDb(makeBooking({ status: "CONFIRMED", completedAt: null }));
  const service = createExperienceBookingsService(database, { now: () => recent });

  const completed = await service.completeBooking({
    bookingId: "booking-101",
    cookId: "cook-101",
  });

  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.completedAt.getTime(), recent.getTime());
  assert.notEqual(completed.completedAt.getTime(), getBooking().bookingDate.getTime(), "Must not derive from scheduled bookingDate");
  assert.equal(calls.bookingUpdates.length, 1);
  assert.equal(calls.bookingUpdates[0].status, "COMPLETED");
  assert.equal(calls.bookingUpdates[0].completedAt.getTime(), recent.getTime());
  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.notifications[0].userId, "customer-101");
  assert.equal(calls.notifications[0].portal, "CUSTOMER");
  assert.equal(calls.notifications[0].metadata.kind, "REVIEW_REQUESTED");
  assert.equal(calls.notifications[0].eventKey, "experience-booking:booking-101:review-request:customer:customer-101");
});

test("future confirmed booking cannot be completed before its persisted slot end", async () => {
  const futureEnd = new Date(now.getTime() + 1);
  const { database, calls, getBooking } = makeMockDb(makeBooking({
    status: "CONFIRMED",
    completedAt: null,
    bookingDate: new Date(now.getTime() - 60 * 60 * 1000),
    slot: { startsAt: new Date(now.getTime() - 60 * 60 * 1000), endsAt: futureEnd },
  }));
  const service = createExperienceBookingsService(database, { now: () => now });

  await assert.rejects(
    service.completeBooking({ bookingId: "booking-101", cookId: "cook-101" }),
    { statusCode: 409, message: /before its scheduled experience has ended/ },
  );

  assert.equal(getBooking().status, "CONFIRMED");
  assert.equal(getBooking().completedAt, null);
  assert.equal(calls.bookingUpdates.length, 0);
  assert.equal(calls.notifications.length, 0);
});

test("completion is allowed exactly at the persisted slot end boundary", async () => {
  const { database, calls, getBooking } = makeMockDb(makeBooking({
    status: "CONFIRMED",
    completedAt: null,
    slot: { startsAt: recent, endsAt: recent },
  }));
  const service = createExperienceBookingsService(database, { now: () => recent });

  const completed = await service.completeBooking({ bookingId: "booking-101", cookId: "cook-101" });

  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.completedAt.getTime(), recent.getTime());
  assert.equal(getBooking().status, "COMPLETED");
  assert.equal(calls.notifications.length, 1);
});

test("cook booking list is scoped through the owning experience", async () => {
  const { database } = makeMockDb(makeBooking());
  let query;
  const original = database.experienceBooking.findMany;
  database.experienceBooking.findMany = async (args) => { query = args; return original(args); };
  const result = await createExperienceBookingsService(database).listForCook("cook-101");
  assert.deepEqual(query.where, { experience: { cookId: "cook-101" } });
  assert.equal(result.items[0].experience.cookId, "cook-101");
});

test("repeated completion transition is idempotent and preserves the original completion timestamp", async () => {
  const originalCompletedAt = new Date("2026-10-15T14:30:00.000Z");
  const { database, calls } = makeMockDb(
    makeBooking({ status: "COMPLETED", completedAt: originalCompletedAt })
  );
  const laterTime = new Date("2026-10-17T10:00:00.000Z");
  const service = createExperienceBookingsService(database, { now: () => laterTime });

  const retry = await service.completeBooking({
    bookingId: "booking-101",
    cookId: "cook-101",
  });

  assert.equal(retry.status, "COMPLETED");
  assert.equal(retry.completedAt.getTime(), originalCompletedAt.getTime(), "Original timestamp must be preserved");
  assert.equal(calls.bookingUpdates.length, 0, "No duplicate update write on already completed booking");
  assert.equal(calls.notifications.length, 1, "Retry must idempotently ensure one review request");
});

test("completed booking without completedAt fails safely without writing or notifying", async () => {
  const { database, calls, getBooking } = makeMockDb(
    makeBooking({ status: "COMPLETED", completedAt: null })
  );
  const service = createExperienceBookingsService(database, { now: () => now });

  await assert.rejects(
    service.completeBooking({ bookingId: "booking-101", cookId: "cook-101" }),
    { statusCode: 503, message: /no authoritative completion timestamp/ }
  );

  assert.equal(getBooking().status, "COMPLETED");
  assert.equal(getBooking().completedAt, null, "Must not fabricate a completion timestamp");
  assert.equal(calls.bookingUpdates.length, 0);
  assert.equal(calls.notifications.length, 0);
});

test("expired completed booking retry does not create a review request notification", async () => {
  const expiredCompletedAt = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000 - 1);
  const { database, calls } = makeMockDb(
    makeBooking({ status: "COMPLETED", completedAt: expiredCompletedAt })
  );
  const service = createExperienceBookingsService(database, { now: () => now });

  const retry = await service.completeBooking({ bookingId: "booking-101", cookId: "cook-101" });

  assert.equal(retry.status, "COMPLETED");
  assert.equal(retry.completedAt.getTime(), expiredCompletedAt.getTime());
  assert.equal(calls.bookingUpdates.length, 0);
  assert.equal(calls.notifications.length, 0);
});

test("serialization-conflict recovery does not notify for an expired completion", async () => {
  const expiredCompletedAt = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000 - 1);
  const { database, calls, getBooking } = makeMockDb(
    makeBooking({ status: "COMPLETED", completedAt: expiredCompletedAt })
  );
  const originalTransaction = database.$transaction;
  const originalFindFirst = database.experienceBooking.findFirst;
  let transactionAttempts = 0;
  let recoveryReads = 0;
  database.experienceBooking.findFirst = (...args) => {
    recoveryReads += 1;
    return originalFindFirst(...args);
  };
  database.$transaction = (...args) => {
    transactionAttempts += 1;
    if (transactionAttempts === 1) {
      return Promise.reject(Object.assign(new Error("serialization conflict"), { code: "P2034" }));
    }
    return originalTransaction(...args);
  };
  const service = createExperienceBookingsService(database, { now: () => now });

  const recovered = await service.completeBooking({ bookingId: "booking-101", cookId: "cook-101" });

  assert.equal(transactionAttempts, 1, "Expired completion must not open a notification transaction");
  assert.equal(recoveryReads, 1, "Conflict recovery rechecks the persisted completed booking");
  assert.equal(recovered.status, "COMPLETED");
  assert.equal(getBooking().completedAt.getTime(), expiredCompletedAt.getTime());
  assert.equal(calls.bookingUpdates.length, 0);
  assert.equal(calls.notifications.length, 0);
});

test("serialization-conflict recovery preserves an eligible review request", async () => {
  const { database, calls } = makeMockDb(
    makeBooking({ status: "COMPLETED", completedAt: fourteenDaysAgo })
  );
  const originalTransaction = database.$transaction;
  let transactionAttempts = 0;
  database.$transaction = (...args) => {
    transactionAttempts += 1;
    if (transactionAttempts === 1) {
      return Promise.reject(Object.assign(new Error("serialization conflict"), { code: "P2034" }));
    }
    return originalTransaction(...args);
  };
  const service = createExperienceBookingsService(database, { now: () => now });

  const recovered = await service.completeBooking({ bookingId: "booking-101", cookId: "cook-101" });

  assert.equal(recovered.status, "COMPLETED");
  assert.equal(calls.notifications.length, 1, "The inclusive 14-day boundary remains eligible");
  assert.equal(calls.notifications[0].eventKey, "experience-booking:booking-101:review-request:customer:customer-101");
});

test("concurrent/repeated event completion creates one review request and preserves cook ownership", async () => {
  const { database, calls } = makeMockDb(makeBooking());
  const service = createExperienceBookingsService(database, { now: () => recent });
  const results = await Promise.all([
    service.completeBooking({ bookingId: "booking-101", cookId: "cook-101" }),
    service.completeBooking({ bookingId: "booking-101", cookId: "cook-101" }),
  ]);
  assert.ok(results.every((result) => result.status === "COMPLETED"));
  assert.equal(calls.bookingUpdates.length, 1);
  assert.equal(calls.notifications.length, 1);
  await assert.rejects(service.completeBooking({ bookingId: "booking-101", cookId: "another-cook" }), { statusCode: 404 });
});

test("notification failure rolls back the completion transaction", async () => {
  const { database, getBooking } = makeMockDb(makeBooking());
  database.userNotification.upsert = async () => { throw new Error("notification write failed"); };
  const service = createExperienceBookingsService(database, { now: () => recent });
  await assert.rejects(service.completeBooking({ bookingId: "booking-101", cookId: "cook-101" }), /notification write failed/);
  assert.equal(getBooking().status, "CONFIRMED", "Mock transaction rollback leaves the booking unchanged");
});

test("unrelated booking updates do not overwrite the completedAt timestamp", async () => {
  const originalCompletedAt = new Date("2026-10-15T14:30:00.000Z");
  const { database, getBooking } = makeMockDb(
    makeBooking({ status: "COMPLETED", completedAt: originalCompletedAt, numberOfGuests: 2 })
  );
  const service = createExperienceBookingsService(database);

  const updated = await service.updateBookingDetails({
    bookingId: "booking-101",
    numberOfGuests: 4,
  });

  assert.equal(updated.numberOfGuests, 4);
  assert.equal(getBooking().completedAt.getTime(), originalCompletedAt.getTime(), "completedAt must be untouched");
});

test("cancelled bookings cannot be completed and non-existent bookings return 404", async () => {
  const { database } = makeMockDb(makeBooking({ status: "CANCELLED" }));
  const service = createExperienceBookingsService(database);

  await assert.rejects(
    service.completeBooking({ bookingId: "booking-101", cookId: "cook-101" }),
    { statusCode: 409, message: /Cancelled bookings cannot be completed/ }
  );

  await assert.rejects(
    service.completeBooking({ bookingId: "non-existent-booking", cookId: "cook-101" }),
    { statusCode: 404 }
  );

  await assert.rejects(
    service.completeBooking({ bookingId: "booking-101", cookId: "wrong-cook" }),
    { statusCode: 404 }
  );
});

test("event reviews fail closed when completed booking lacks a trustworthy completedAt timestamp", async () => {
  // Legacy or unrecorded completion timestamp
  const { database } = makeMockDb(makeBooking({ status: "COMPLETED", completedAt: null }));
  const reviewsService = createReviewsService(database, { now: () => now });

  await assert.rejects(
    reviewsService.create("customer-101", { reviewType: "EXPERIENCE", bookingId: "booking-101", rating: 5 }),
    { statusCode: 503, message: /authoritative completion time/ }
  );
});

test("event reviews reject uncompleted booking statuses (CONFIRMED, PENDING, CANCELLED)", async () => {
  for (const status of ["CONFIRMED", "PENDING", "CANCELLED"]) {
    const { database } = makeMockDb(makeBooking({ status, completedAt: null }));
    const reviewsService = createReviewsService(database, { now: () => now });

    await assert.rejects(
      reviewsService.create("customer-101", { reviewType: "EXPERIENCE", bookingId: "booking-101", rating: 5 }),
      { statusCode: 409, message: /You can review an event after its booking is completed/ }
    );
  }
});

test("14-day event review eligibility includes exact boundary and excludes bookings past 14 days", async () => {
  // Exactly 14 days ago: eligible
  const { database: eligibleDb } = makeMockDb(
    makeBooking({ status: "COMPLETED", completedAt: fourteenDaysAgo })
  );
  const eligibleService = createReviewsService(eligibleDb, { now: () => now });
  const result = await eligibleService.create("customer-101", {
    reviewType: "EXPERIENCE",
    bookingId: "booking-101",
    rating: 5,
    comment: "Boundary test: exactly 14 days",
  });
  assert.equal(result.rating, 5);

  // 14 days + 1 millisecond ago: expired
  const expiredTime = new Date(fourteenDaysAgo.getTime() - 1);
  const { database: expiredDb } = makeMockDb(
    makeBooking({ status: "COMPLETED", completedAt: expiredTime })
  );
  const expiredService = createReviewsService(expiredDb, { now: () => now });
  await assert.rejects(
    expiredService.create("customer-101", { reviewType: "EXPERIENCE", bookingId: "booking-101", rating: 5 }),
    { statusCode: 409, message: /The review window has ended/ }
  );
});

test("eligible event review submission persists with snapshots and notifies the cook transactionally", async () => {
  const { database, calls } = makeMockDb(
    makeBooking({ status: "COMPLETED", completedAt: recent })
  );
  const reviewsService = createReviewsService(database, { now: () => now });

  const review = await reviewsService.create("customer-101", {
    reviewType: "EXPERIENCE",
    bookingId: "booking-101",
    rating: 5,
    comment: "Incredible regional food and storytelling!",
  });

  assert.equal(review.id, "review-event-1");
  assert.equal(calls.createdReviews.length, 1);
  assert.deepEqual(calls.createdReviews[0], {
    reviewType: "EXPERIENCE",
    experienceBookingId: "booking-101",
    customerId: "customer-101",
    cookId: "cook-101",
    subjectNameSnapshot: "Heritage Kathiawadi Thali Workshop",
    cookNameSnapshot: "Alka's Rasoi",
    rating: 5,
    comment: "Incredible regional food and storytelling!",
  });

  // Cook notification check
  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.notifications[0].userId, "cook-user-101");
  assert.equal(calls.notifications[0].portal, "COOK");
  assert.match(calls.notifications[0].eventKey, /^review:review-event-1:created:cook:cook-user-101$/);
});

test("duplicate event review submission is prevented", async () => {
  const { database } = makeMockDb(
    makeBooking({ status: "COMPLETED", completedAt: recent, review: { id: "existing-review" } })
  );
  const reviewsService = createReviewsService(database, { now: () => now });

  await assert.rejects(
    reviewsService.create("customer-101", { reviewType: "EXPERIENCE", bookingId: "booking-101", rating: 5 }),
    { statusCode: 409, message: /This event booking has already been reviewed/ }
  );
});

test("eligible completed event bookings appear in listPending within the 14-day window", async () => {
  const { database } = makeMockDb(
    makeBooking({ status: "COMPLETED", completedAt: recent, review: null })
  );
  const reviewsService = createReviewsService(database, { now: () => now });

  const pending = await reviewsService.listPending("customer-101", { page: 1, limit: 10 });
  assert.equal(pending.items.length, 1);
  assert.equal(pending.items[0].reviewType, "EXPERIENCE");
  assert.equal(pending.items[0].bookingId, "booking-101");
  assert.equal(pending.items[0].subjectName, "Heritage Kathiawadi Thali Workshop");
  assert.equal(pending.items[0].completedAt.getTime(), recent.getTime());
});
