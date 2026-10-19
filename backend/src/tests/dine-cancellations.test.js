import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDineCancellationsService } from "../modules/events/dine-cancellations.service.js";
import { createDinePaymentsService } from "../modules/events/dine-payments.service.js";
import { createDineBookingExpiryService } from "../modules/events/dine-booking-expiry.service.js";
import { createDineBookingSchema } from "../modules/events/dine-bookings.validation.js";

const now = new Date("2026-10-18T12:00:00.000Z");
const futureStart = new Date("2026-10-22T12:00:00.000Z");

const pendingAttempt = (overrides = {}) => ({
  id: "attempt-pending", experienceBookingId: "booking-1", attemptNumber: 1,
  idempotencyKey: "attempt-key-1", reference: "TB-SIM-1", provider: "SIMULATED",
  status: "PENDING", verificationMode: null, amount: "250.00", currency: "INR",
  expiresAt: new Date(now.getTime() + 15 * 60_000), refund: null, ...overrides,
});

const succeededAttempt = (overrides = {}) => pendingAttempt({
  id: "attempt-success", status: "SUCCEEDED", verificationMode: "SIMULATED",
  succeededAt: new Date(now.getTime() - 60_000), refund: null, ...overrides,
});

const fixture = ({ booking: bookingOverrides = {}, settings = {}, notificationFails = false } = {}) => {
  const state = {
    booking: {
      id: "booking-1", experienceId: "experience-1", customerId: "customer-1", slotId: "slot-1",
      bookingDate: futureStart, numberOfGuests: 2, totalAmount: 250,
      totalAmountSnapshot: "250.00", status: "PENDING",
      holdExpiresAt: new Date(now.getTime() + 24 * 60 * 60_000), expiredAt: null,
      acceptedAt: null, rejectedAt: null, paymentExpiresAt: null, completedAt: null,
      updatedAt: now,
      slot: { id: "slot-1", startsAt: futureStart, capacity: 6, availableSeats: 4, status: "OPEN" },
      experience: { id: "experience-1", title: "Sunday Table", cook: { userId: "cook-user-1" } },
      paymentAttempts: [],
      ...bookingOverrides,
    },
    settings: { experienceCancellationWindowHours: 48, ...settings },
    refunds: [], events: [], notifications: [],
    nextId: 1,
  };
  state.booking.slot = {
    id: "slot-1", startsAt: futureStart, capacity: 6, availableSeats: 4, status: "OPEN",
    ...(bookingOverrides.slot || {}),
  };
  state.booking.experience = {
    id: "experience-1", cookId: "cook-1", title: "Sunday Table", cook: { userId: "cook-user-1" },
    ...(bookingOverrides.experience || {}),
  };
  const controls = { providerEntered: null, releaseProvider: null };
  const tx = {
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join("?");
      if (sql.includes('FROM "ExperienceBooking"') && sql.includes('FOR UPDATE')) {
        if (sql.includes('SELECT "id" FROM') || sql.includes('SELECT b."id" FROM')) {
          if (sql.includes('cookId')) {
            const [bookingId, cookId] = values;
            return bookingId === state.booking.id && cookId === (state.booking.experience?.cookId || "cook-1") ? [{ id: bookingId }] : [];
          }
          const [bookingId, customerId] = values;
          return bookingId === state.booking.id && customerId === state.booking.customerId ? [{ id: bookingId }] : [];
        }
        const dueAt = sql.includes("LIMIT CAST") ? values[0] : values[1];
        const due = (state.booking.status === "PENDING" && state.booking.holdExpiresAt <= dueAt)
          || (state.booking.status === "ACCEPTED" && state.booking.paymentExpiresAt <= dueAt);
        return due && state.booking.slotId ? [{
          id: state.booking.id, slotId: state.booking.slotId, customerId: state.booking.customerId,
          numberOfGuests: state.booking.numberOfGuests, status: state.booking.status,
        }] : [];
      }
      if (sql.includes('UPDATE "ExperienceSlot"')) {
        const [seats, slotId] = values;
        if (slotId !== state.booking.slot?.id || !["OPEN", "PAUSED"].includes(state.booking.slot.status)
          || state.booking.slot.availableSeats + seats > state.booking.slot.capacity) return [];
        state.booking.slot.availableSeats += seats;
        return [{ id: slotId }];
      }
      if (sql.includes('FROM "ExperienceBooking"') && sql.includes('"slotId"')) return [];
      return [];
    },
    experienceBooking: {
      findFirst: async ({ where }) => {
        if (where.id !== state.booking.id) return null;
        if (where.customerId && where.customerId !== state.booking.customerId) return null;
        if (where.experience?.cookId && where.experience.cookId !== (state.booking.experience?.cookId || "cook-1")) return null;
        return structuredClone(state.booking);
      },
      aggregate: async ({ where }) => ({
        _sum: { numberOfGuests: where.slotId === state.booking.slotId
          && where.status.in.includes(state.booking.status) ? state.booking.numberOfGuests : 0 },
      }),
      updateMany: async ({ where, data }) => {
        if (where.id !== state.booking.id) return { count: 0 };
        if (where.customerId && where.customerId !== state.booking.customerId) return { count: 0 };
        if (where.experience?.cookId && where.experience.cookId !== (state.booking.experience?.cookId || "cook-1")) return { count: 0 };
        if (where.status && where.status !== state.booking.status) return { count: 0 };
        if (where.cancellationStatus && where.cancellationStatus !== state.booking.cancellationStatus) return { count: 0 };
        if (where.paymentExpiresAt?.gt && !(state.booking.paymentExpiresAt > where.paymentExpiresAt.gt)) return { count: 0 };
        if (where.paymentExpiresAt?.lte && !(state.booking.paymentExpiresAt <= where.paymentExpiresAt.lte)) return { count: 0 };
        if (where.holdExpiresAt?.gt && !(state.booking.holdExpiresAt > where.holdExpiresAt.gt)) return { count: 0 };
        if (where.holdExpiresAt?.lte && !(state.booking.holdExpiresAt <= where.holdExpiresAt.lte)) return { count: 0 };
        Object.assign(state.booking, data, { updatedAt: now });
        return { count: 1 };
      },
    },
    experiencePaymentAttempt: {
      updateMany: async ({ where, data }) => {
        const matches = state.booking.paymentAttempts.filter((attempt) => attempt.status === where.status
          && attempt.experienceBookingId === where.experienceBookingId
          && (!where.id || attempt.id === where.id)
          && (!where.expiresAt?.gt || attempt.expiresAt > where.expiresAt.gt)
          && (!where.expiresAt?.lte || attempt.expiresAt <= where.expiresAt.lte));
        matches.forEach((attempt) => Object.assign(attempt, data));
        return { count: matches.length };
      },
      findMany: async ({ where }) => state.booking.paymentAttempts
        .filter((attempt) => attempt.experienceBookingId === where.experienceBookingId && attempt.status === where.status)
        .map(({ id }) => ({ id })),
    },
    experiencePaymentEvent: {
      create: async ({ data }) => {
        const event = { id: `event-${state.events.length + 1}`, ...data };
        state.events.push(event);
        return event;
      },
    },
    experienceRefund: {
      create: async ({ data }) => {
        const refund = { id: `refund-${state.nextId++}`, ...data };
        state.refunds.push(refund);
        const attempt = state.booking.paymentAttempts.find((item) => item.id === data.paymentAttemptId);
        if (attempt) attempt.refund = refund;
        return refund;
      },
      findUnique: async ({ where }) => state.refunds.find((item) => item.paymentAttemptId === where.paymentAttemptId) || null,
    },
    platformSettings: { findUnique: async () => state.settings },
    userNotification: {
      upsert: async ({ create }) => {
        if (notificationFails) throw new Error("simulated notification failure");
        const existing = state.notifications.find((item) => item.eventKey === create.eventKey);
        if (existing) return existing;
        state.notifications.push(create);
        return create;
      },
    },
  };

  let transactionTail = Promise.resolve();
  const database = {
    ...tx,
    async $transaction(operation, options) {
      assert.equal(options?.isolationLevel, "Serializable");
      let release;
      const previous = transactionTail;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      const snapshot = structuredClone(state);
      try { return await operation(tx); }
      catch (error) {
        Object.assign(state, snapshot);
        throw error;
      } finally { release(); }
    },
  };
  const paymentProvider = {
    async confirmPayment({ reference, mockOutcome }) {
      controls.providerEntered?.();
      if (controls.releaseProvider) await controls.releaseProvider;
      return { reference, status: mockOutcome === "SUCCESS" ? "SUCCEEDED" : "FAILED" };
    },
  };
  return { database, state, paymentProvider, controls };
};

const makeService = (fixtureValue, clock = () => now) => createDineCancellationsService(fixtureValue.database, { now: clock });

test("customer ownership is enforced and PENDING cancellation releases the hold only once without a refund", async () => {
  const f = fixture();
  const service = makeService(f);
  await assert.rejects(service.cancelBooking("customer-2", "booking-1"), { statusCode: 404 });
  assert.equal(f.state.booking.status, "PENDING");

  const result = await service.cancelBooking("customer-1", "booking-1");
  assert.equal(result.booking.status, "CANCELLED");
  assert.equal(result.refund, null);
  assert.equal(f.state.booking.slot.availableSeats, 6);
  assert.equal(f.state.notifications.length, 1);
  assert.equal(f.state.notifications[0].eventKey, "experience-booking:booking-1:customer-cancelled:cook:cook-user-1");
  await service.cancelBooking("customer-1", "booking-1");
  assert.equal(f.state.booking.slot.availableSeats, 6);
  assert.equal(f.state.notifications.length, 1);
  assert.equal(f.state.refunds.length, 0);
});

test("ACCEPTED cancellation expires pending attempts and records deterministic events without refund", async () => {
  const f = fixture({ booking: {
    status: "ACCEPTED", acceptedAt: now, paymentExpiresAt: new Date(now.getTime() + 15 * 60_000),
    paymentAttempts: [pendingAttempt()],
  } });
  const result = await makeService(f).cancelBooking("customer-1", "booking-1");
  assert.equal(result.booking.status, "CANCELLED");
  assert.equal(result.refund, null);
  assert.equal(f.state.booking.paymentAttempts[0].status, "EXPIRED");
  assert.equal(f.state.events.length, 1);
  assert.equal(f.state.events[0].reasonCode, "BOOKING_CANCELLED");
  assert.equal(f.state.booking.slot.availableSeats, 6);
});

test("CONFIRMED cancellation is allowed exactly at the configured cutoff and records only a simulated full refund", async () => {
  const startsAt = new Date(now.getTime() + 48 * 60 * 60_000);
  const f = fixture({
    settings: { experienceCancellationWindowHours: 48 },
    booking: { status: "CONFIRMED", slot: { startsAt }, paymentAttempts: [succeededAttempt()] },
  });
  const result = await makeService(f, () => now).cancelBooking("customer-1", "booking-1");
  assert.equal(result.booking.status, "CANCELLED");
  assert.deepEqual(result.refund, {
    id: "refund-1", status: "SUCCEEDED", provider: "SIMULATED", verificationMode: "SIMULATED",
    amount: 250, currency: "INR", attemptCount: 1, succeededAt: now,
    simulated: true, realMoneyReturned: false,
  });
  assert.equal(f.state.booking.slot.availableSeats, 6);
  assert.equal(f.state.refunds[0].idempotencyKey, "experience-booking:booking-1:customer-cancellation:refund");
  assert.equal(f.state.refunds.length, 1);
});

test("configured cancellation window is used and cancellation after the boundary is rejected unchanged", async () => {
  const exactStart = new Date(now.getTime() + 24 * 60 * 60_000);
  const exact = fixture({
    settings: { experienceCancellationWindowHours: 24 },
    booking: { status: "CONFIRMED", slot: { startsAt: exactStart }, paymentAttempts: [succeededAttempt()] },
  });
  assert.equal((await makeService(exact).cancelBooking("customer-1", "booking-1")).booking.status, "CANCELLED");

  const startsAt = new Date(now.getTime() + 23 * 60 * 60_000);
  const f = fixture({
    settings: { experienceCancellationWindowHours: 24 },
    booking: { status: "CONFIRMED", slot: { startsAt }, paymentAttempts: [succeededAttempt()] },
  });
  await assert.rejects(makeService(f).cancelBooking("customer-1", "booking-1"), { statusCode: 409 });
  assert.equal(f.state.booking.status, "CONFIRMED");
  assert.equal(f.state.booking.slot.availableSeats, 4);
  assert.equal(f.state.refunds.length, 0);
  assert.equal(f.state.notifications.length, 0);
});

test("terminal non-cancelled states cannot transition and legacy cancellation is idempotent", async () => {
  for (const status of ["COMPLETED", "REJECTED", "EXPIRED"]) {
    const f = fixture({ booking: { status } });
    await assert.rejects(makeService(f).cancelBooking("customer-1", "booking-1"), { statusCode: 409 });
    assert.equal(f.state.booking.status, status);
    assert.equal(f.state.booking.slot.availableSeats, 4);
  }
  const f = fixture({ booking: { status: "CANCELLED" } });
  const result = await makeService(f).cancelBooking("customer-1", "booking-1");
  assert.equal(result.booking.status, "CANCELLED");
  assert.equal(f.state.booking.slot.availableSeats, 4);
  assert.equal(f.state.notifications.length, 0);
});

test("repeated confirmed cancellation returns the same simulated refund without a second seat release", async () => {
  const f = fixture({ booking: {
    status: "CONFIRMED", slot: { startsAt: new Date(now.getTime() + 72 * 60 * 60_000) },
    paymentAttempts: [succeededAttempt()],
  } });
  const service = makeService(f);
  const first = await service.cancelBooking("customer-1", "booking-1");
  const retry = await service.cancelBooking("customer-1", "booking-1");
  assert.equal(retry.booking.status, "CANCELLED");
  assert.equal(retry.refund.id, first.refund.id);
  assert.equal(f.state.refunds.length, 1);
  assert.equal(f.state.booking.slot.availableSeats, 6);
  assert.equal(f.state.notifications.length, 1);
});

test("transaction failure rolls back booking cancellation, refund, seat release, and notification", async () => {
  const f = fixture({ notificationFails: true, booking: {
    status: "CONFIRMED", slot: { startsAt: new Date(now.getTime() + 72 * 60 * 60_000) },
    paymentAttempts: [succeededAttempt()],
  } });
  await assert.rejects(makeService(f).cancelBooking("customer-1", "booking-1"), /simulated notification failure/);
  assert.equal(f.state.booking.status, "CONFIRMED");
  assert.equal(f.state.booking.slot.availableSeats, 4);
  assert.equal(f.state.refunds.length, 0);
  assert.equal(f.state.notifications.length, 0);
});

test("cancellation racing with payment confirmation cannot revive the cancelled booking or release seats twice", async () => {
  const f = fixture({ booking: {
    status: "ACCEPTED", acceptedAt: now, paymentExpiresAt: new Date(now.getTime() + 15 * 60_000),
    paymentAttempts: [pendingAttempt()],
  } });
  let entered;
  const providerEntered = new Promise((resolve) => { entered = resolve; });
  let release;
  f.controls.providerEntered = entered;
  f.controls.releaseProvider = new Promise((resolve) => { release = resolve; });
  const payments = createDinePaymentsService(f.database, {
    now: () => now,
    paymentProvider: f.paymentProvider,
    notificationServiceFactory: (tx) => ({ create: (data) => tx.userNotification.upsert({ create: data }) }),
  });
  const confirmation = payments.confirmPayment("customer-1", "booking-1", "attempt-pending", "success");
  await providerEntered;
  await makeService(f).cancelBooking("customer-1", "booking-1");
  release();
  await assert.rejects(confirmation, { statusCode: 409 });
  assert.equal(f.state.booking.status, "CANCELLED");
  assert.equal(f.state.booking.paymentAttempts[0].status, "EXPIRED");
  assert.equal(f.state.booking.slot.availableSeats, 6);
  assert.equal(f.state.refunds.length, 0);
});

test("cancellation racing with payment expiry releases the hold once and leaves a terminal state", async () => {
  const f = fixture({ booking: {
    status: "ACCEPTED", acceptedAt: now, paymentExpiresAt: now,
    paymentAttempts: [pendingAttempt({ expiresAt: now })],
  } });
  const outcomes = await Promise.allSettled([
    makeService(f).cancelBooking("customer-1", "booking-1"),
    createDineBookingExpiryService(f.database, { now: () => now }).runBatch(),
  ]);
  assert.equal(outcomes[0].status, "rejected");
  assert.equal(outcomes[1].status, "fulfilled");
  assert.equal(f.state.booking.status, "EXPIRED");
  assert.equal(f.state.booking.paymentAttempts[0].status, "EXPIRED");
  assert.equal(f.state.booking.slot.availableSeats, 6);
  assert.equal(f.state.notifications.length, 1);
});

test("customer cancellation is authenticated, owner-scoped, validated, and exposed on the event API", async () => {
  const [routes, controller, validation] = await Promise.all([
    readFile(new URL("../modules/events/customer-events.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../modules/events/customer-events.controller.js", import.meta.url), "utf8"),
    readFile(new URL("../modules/events/dine-bookings.validation.js", import.meta.url), "utf8"),
  ]);
  assert.match(routes, /router\.use\(authenticate, requireCustomerOrderAccess\)/);
  assert.match(routes, /router\.post\("\/bookings\/:id\/cancel", validate\(cancelDineBookingSchema\), cancelMyDineBooking\)/);
  assert.match(controller, /dineCancellations\.requestCancellation\(req\.user\.id, req\.params\.id, reason\)/);
  assert.match(validation, /cancelDineBookingSchema[\s\S]*params: z\.object\(\{ id: recordId \}\)/);
  assert.match(validation, /Cancellation reason must be at least 5 characters/);
  assert.equal(createDineBookingSchema.body.safeParse({ experienceId: "e", slotId: "s", numberOfGuests: 1, idempotencyKey: "request-123" }).success, true);
});

test("customer cancellation request validates required reason length between 5 and 500 characters", async () => {
  const f = fixture({ booking: {
    status: "CONFIRMED", slot: { startsAt: new Date(now.getTime() + 72 * 60 * 60_000) },
    paymentAttempts: [succeededAttempt()],
  } });
  const service = makeService(f);

  await assert.rejects(service.requestCancellation("customer-1", "booking-1", ""), { statusCode: 400 });
  await assert.rejects(service.requestCancellation("customer-1", "booking-1", "bad"), { statusCode: 400 });
  await assert.rejects(service.requestCancellation("customer-1", "booking-1", "a".repeat(501)), { statusCode: 400 });
});

test("customer cancellation request puts confirmed booking into PENDING cancellation status and notifies Cook without releasing seats", async () => {
  const f = fixture({ booking: {
    status: "CONFIRMED", slot: { startsAt: new Date(now.getTime() + 72 * 60 * 60_000) },
    paymentAttempts: [succeededAttempt()],
  } });
  const service = makeService(f);

  const res = await service.requestCancellation("customer-1", "booking-1", "Unforeseen flight delay cannot make it");
  assert.equal(res.booking.status, "CONFIRMED");
  assert.equal(res.booking.cancellationStatus, "PENDING");
  assert.equal(res.booking.cancellationReason, "Unforeseen flight delay cannot make it");
  assert.equal(f.state.booking.status, "CONFIRMED");
  assert.equal(f.state.booking.slot.availableSeats, 4); // seats stay held
  assert.equal(f.state.refunds.length, 0); // no refund yet
  assert.equal(f.state.notifications.length, 1);
  assert.equal(f.state.notifications[0].portal, "COOK");
  assert.match(f.state.notifications[0].message, /Unforeseen flight delay/);
});

test("customer cancellation request within 48 hours cutoff is rejected", async () => {
  const f = fixture({ booking: {
    status: "CONFIRMED", slot: { startsAt: new Date(now.getTime() + 24 * 60 * 60_000) }, // only 24h away
    paymentAttempts: [succeededAttempt()],
  } });
  const service = makeService(f);

  await assert.rejects(
    service.requestCancellation("customer-1", "booking-1", "Cannot attend tomorrow"),
    { statusCode: 409 },
  );
  assert.equal(f.state.booking.status, "CONFIRMED");
  assert.equal(f.state.booking.cancellationStatus, undefined);
  assert.equal(f.state.notifications.length, 0);
});

test("confirmed cancellation request uses the persisted slot instant immediately before, at, and after the configured cutoff", async () => {
  const cutoffMs = 48 * 60 * 60_000;

  for (const offsetMs of [1, 0]) {
    const f = fixture({ booking: {
      status: "CONFIRMED",
      slot: { startsAt: new Date(now.getTime() + cutoffMs + offsetMs) },
      experience: { type: "WORKSHOP" },
      paymentAttempts: [succeededAttempt()],
    } });
    const service = makeService(f, () => now);
    const result = await service.requestCancellation("customer-1", "booking-1", "Cannot attend the workshop.");
    assert.equal(result.booking.cancellationStatus, "PENDING");
    assert.equal(f.state.booking.slot.availableSeats, 4, "Seats remain held while the Cook reviews the request.");
  }

  const afterCutoff = fixture({ booking: {
    status: "CONFIRMED",
    slot: { startsAt: new Date(now.getTime() + cutoffMs - 1) },
    experience: { type: "WORKSHOP" },
    paymentAttempts: [succeededAttempt()],
  } });
  await assert.rejects(
    makeService(afterCutoff, () => now).requestCancellation("customer-1", "booking-1", "Cannot attend the workshop."),
    { statusCode: 409 },
  );
  assert.equal(afterCutoff.state.booking.cancellationStatus, undefined);
  assert.equal(afterCutoff.state.notifications.length, 0);
});

test("unauthorized customer cannot request cancellation for another customer's booking", async () => {
  const f = fixture({ booking: {
    status: "CONFIRMED", slot: { startsAt: new Date(now.getTime() + 72 * 60 * 60_000) },
    paymentAttempts: [succeededAttempt()],
  } });
  const service = makeService(f);

  await assert.rejects(
    service.requestCancellation("wrong-customer", "booking-1", "Legitimate reason here"),
    { statusCode: 404 },
  );
});

test("Cook approves cancellation: cancels booking, restores seats once, records exact simulated refund, and notifies customer", async () => {
  const f = fixture({ booking: {
    status: "CONFIRMED",
    cancellationStatus: "PENDING",
    cancellationReason: "Guest had a medical emergency",
    slot: { startsAt: new Date(now.getTime() + 72 * 60 * 60_000) },
    paymentAttempts: [succeededAttempt()],
  } });
  const service = makeService(f);

  const res = await service.approveCancellation("cook-1", "booking-1");
  assert.equal(res.booking.status, "CANCELLED");
  assert.equal(res.booking.cancellationStatus, "APPROVED");
  assert.equal(res.refund.status, "SUCCEEDED");
  assert.equal(res.refund.amount, 250);
  assert.equal(res.refund.simulated, true);
  assert.equal(f.state.booking.slot.availableSeats, 6); // 4 + 2 = 6 restored
  assert.equal(f.state.refunds.length, 1);
  assert.equal(f.state.notifications.length, 1);
  assert.equal(f.state.notifications[0].portal, "CUSTOMER");
  assert.match(f.state.notifications[0].message, /approved your cancellation/);
  assert.match(f.state.notifications[0].message, /250/);
});

test("Cook approval is idempotent on retry: no second refund or seat restoration", async () => {
  const f = fixture({ booking: {
    status: "CONFIRMED",
    cancellationStatus: "PENDING",
    cancellationReason: "Change of plans",
    slot: { startsAt: new Date(now.getTime() + 72 * 60 * 60_000) },
    paymentAttempts: [succeededAttempt()],
  } });
  const service = makeService(f);

  const first = await service.approveCancellation("cook-1", "booking-1");
  const second = await service.approveCancellation("cook-1", "booking-1");

  assert.equal(second.booking.status, "CANCELLED");
  assert.equal(second.booking.cancellationStatus, "APPROVED");
  assert.equal(second.refund.id, first.refund.id);
  assert.equal(f.state.booking.slot.availableSeats, 6); // still 6, not 8
  assert.equal(f.state.refunds.length, 1);
  assert.equal(f.state.notifications.length, 1);
});

test("Cook rejects cancellation: booking remains CONFIRMED, seats remain held, customer notified with rejection reason", async () => {
  const f = fixture({ booking: {
    status: "CONFIRMED",
    cancellationStatus: "PENDING",
    cancellationReason: "Change of plans",
    slot: { startsAt: new Date(now.getTime() + 72 * 60 * 60_000) },
    paymentAttempts: [succeededAttempt()],
  } });
  const service = makeService(f);

  const res = await service.rejectCancellation("cook-1", "booking-1", "Per policy fresh ingredients were already sourced");
  assert.equal(res.booking.status, "CONFIRMED");
  assert.equal(res.booking.cancellationStatus, "REJECTED");
  assert.equal(res.booking.cancellationDecisionReason, "Per policy fresh ingredients were already sourced");
  assert.equal(f.state.booking.status, "CONFIRMED");
  assert.equal(f.state.booking.slot.availableSeats, 4); // still 4, NOT released
  assert.equal(f.state.refunds.length, 0); // no refund
  assert.equal(f.state.notifications.length, 1);
  assert.equal(f.state.notifications[0].portal, "CUSTOMER");
  assert.match(f.state.notifications[0].message, /declined your cancellation request/);
  assert.match(f.state.notifications[0].message, /fresh ingredients were already sourced/);
});

test("Cook rejection preserves unpaid booking status and reports the actual state to the customer", async () => {
  for (const status of ["PENDING", "ACCEPTED"]) {
    const f = fixture({ booking: {
      status,
      cancellationStatus: "PENDING",
      cancellationReason: "Plans changed and I cannot attend",
      paymentExpiresAt: status === "ACCEPTED" ? new Date(now.getTime() + 15 * 60_000) : null,
      paymentAttempts: status === "ACCEPTED" ? [pendingAttempt()] : [],
    } });

    const result = await makeService(f).rejectCancellation("cook-1", "booking-1", "The booking remains available");
    assert.equal(result.booking.status, status);
    assert.equal(result.booking.cancellationStatus, "REJECTED");
    assert.equal(f.state.booking.slot.availableSeats, 4);
    assert.equal(f.state.refunds.length, 0);
    assert.match(f.state.notifications[0].message, new RegExp(`reservation remains ${status.toLowerCase()}`));
    assert.doesNotMatch(f.state.notifications[0].message, /reservation remains confirmed/i);
  }
});

test("unauthorized Cook cannot approve or reject cancellation", async () => {
  const f = fixture({ booking: {
    status: "CONFIRMED",
    cancellationStatus: "PENDING",
    cancellationReason: "Medical reason",
    slot: { startsAt: new Date(now.getTime() + 72 * 60 * 60_000) },
    paymentAttempts: [succeededAttempt()],
  } });
  const service = makeService(f);

  await assert.rejects(service.approveCancellation("different-cook", "booking-1"), { statusCode: 404 });
  await assert.rejects(service.rejectCancellation("different-cook", "booking-1", "reason"), { statusCode: 404 });
});

test("unpaid booking cancellation approval releases seats without creating refund record", async () => {
  const f = fixture({ booking: {
    status: "ACCEPTED",
    cancellationStatus: "PENDING",
    cancellationReason: "Decided not to attend",
    slot: { startsAt: new Date(now.getTime() + 72 * 60 * 60_000) },
    paymentAttempts: [pendingAttempt()],
  } });
  const service = makeService(f);

  const res = await service.approveCancellation("cook-1", "booking-1");
  assert.equal(res.booking.status, "CANCELLED");
  assert.equal(res.refund, null);
  assert.equal(f.state.refunds.length, 0);
  assert.equal(f.state.booking.slot.availableSeats, 6);
  assert.equal(f.state.notifications.length, 1);
  assert.match(f.state.notifications[0].message, /No refund was due for this unpaid booking/);
});
