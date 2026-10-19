import assert from "node:assert/strict";
import test from "node:test";
import { createDinePaymentsService } from "../modules/events/dine-payments.service.js";

const now = new Date("2026-10-18T12:00:00.000Z");
const deadline = new Date("2026-10-18T12:15:00.000Z");

const fixture = ({ booking = {}, attempts = [] } = {}) => {
  const state = {
    booking: {
      id: "booking-1",
      customerId: "customer-1",
      status: "ACCEPTED",
      acceptedAt: new Date("2026-10-18T12:00:00.000Z"),
      paymentExpiresAt: deadline,
      totalAmountSnapshot: "250.25",
      slotId: "slot-1",
      experienceId: "experience-1",
      experience: { id: "experience-1", title: "Autumn supper", cook: { userId: "cook-user-1" } },
      numberOfGuests: 2,
      holdExpiresAt: new Date("2026-10-18T12:30:00.000Z"),
      expiredAt: null,
      slot: { id: "slot-1", capacity: 4, availableSeats: 2, status: "OPEN" },
      paymentAttempts: attempts.map((attempt) => ({ ...attempt })),
      ...booking,
    },
    nextId: 1,
    providerCalls: 0,
    providerConfirmCalls: 0,
    events: [],
    notifications: [],
  };
  const tx = {
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join("?");
      if (sql.includes('FROM "ExperienceBooking"')) {
        if (sql.includes('SELECT "id" FROM')) {
          const [bookingId, customerId] = values;
          return bookingId === state.booking.id && customerId === state.booking.customerId ? [{ id: bookingId }] : [];
        }
        if (sql.includes('SELECT "id", "slotId"')) {
          const due = (state.booking.status === "PENDING" && state.booking.holdExpiresAt <= values.at(-1))
            || (state.booking.status === "ACCEPTED" && state.booking.paymentExpiresAt <= values.at(-1));
          return due && state.booking.slotId ? [{
            id: state.booking.id, slotId: state.booking.slotId, customerId: state.booking.customerId,
            numberOfGuests: state.booking.numberOfGuests, status: state.booking.status,
          }] : [];
        }
        return [];
      }
      if (sql.includes('UPDATE "ExperienceSlot"')) {
        const [seats, slotId] = values;
        if (slotId !== state.booking.slot?.id || state.booking.slot.availableSeats + seats > state.booking.slot.capacity) return [];
        state.booking.slot.availableSeats += seats;
        return [{ id: slotId }];
      }
      return [];
    },
    experienceBooking: {
      findFirst: async ({ where }) => where.id === state.booking.id && where.customerId === state.booking.customerId
        ? { ...state.booking, paymentAttempts: state.booking.paymentAttempts.map((attempt) => ({ ...attempt })) }
        : null,
      updateMany: async ({ where, data }) => {
        if (where.id !== state.booking.id || where.status !== state.booking.status) return { count: 0 };
        const expires = where.holdExpiresAt?.lte ?? where.paymentExpiresAt?.lte;
        const actual = where.holdExpiresAt ? state.booking.holdExpiresAt : state.booking.paymentExpiresAt;
        if (!(actual instanceof Date) || actual > expires) return { count: 0 };
        Object.assign(state.booking, data);
        return { count: 1 };
      },
      aggregate: async ({ where }) => ({
        _sum: { numberOfGuests: where.slotId === state.booking.slotId && where.status.in.includes(state.booking.status)
          ? state.booking.numberOfGuests : 0 },
      }),
    },
    experiencePaymentAttempt: {
      create: async ({ data }) => {
        const created = {
          id: `attempt-${state.nextId++}`,
          experienceBookingId: state.booking.id,
          attemptNumber: data.attemptNumber,
          idempotencyKey: data.idempotencyKey,
          reference: data.reference,
          provider: data.provider,
          status: data.status,
          verificationMode: data.verificationMode,
          amount: data.amount,
          currency: data.currency,
          expiresAt: data.expiresAt,
          createdAt: now,
          events: data.events,
        };
        state.booking.paymentAttempts.push(created);
        return created;
      },
      updateMany: async ({ where, data }) => {
        const attempts = state.booking.paymentAttempts.filter((item) => item.experienceBookingId === where.experienceBookingId
          && (!where.id || item.id === where.id) && item.status === where.status
          && (!where.expiresAt?.lte || item.expiresAt <= where.expiresAt.lte)
          && (!where.expiresAt?.gt || item.expiresAt > where.expiresAt.gt));
        attempts.forEach((attempt) => Object.assign(attempt, data));
        return { count: attempts.length };
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
    userNotification: {
      upsert: async ({ create }) => { state.notifications.push(create); return create; },
    },
  };
  let tail = Promise.resolve();
  const database = {
    ...tx,
    async $transaction(operation) {
      let release;
      const previous = tail;
      tail = new Promise((resolve) => { release = resolve; });
      await previous;
      const snapshot = structuredClone(state);
      try { return await operation(tx); }
      catch (error) { Object.assign(state, snapshot); throw error; }
      finally { release(); }
    },
  };
  const provider = {
    async createPayment({ amount, currency, expiresAt }) {
      state.providerCalls += 1;
      return {
        reference: `TB-SIM-${state.providerCalls}`,
        amount,
        currency,
        method: "SIMULATED",
        status: "PENDING",
        expiresAt,
      };
    },
    async confirmPayment({ reference, mockOutcome }) {
      state.providerConfirmCalls += 1;
      return { reference, status: mockOutcome === "SUCCESS" ? "SUCCEEDED" : "FAILED" };
    },
  };
  return { database, provider, state };
};

const key = "a2e50093-4d1d-4aef-92b5-614b0903d95d";

test("only the owning customer can initiate payment for an accepted booking", async () => {
  const { database, provider, state } = fixture();
  const service = createDinePaymentsService(database, { now: () => now, paymentProvider: provider });
  await assert.rejects(service.initiatePayment("other-customer", "booking-1", key), { statusCode: 404 });
  state.booking.status = "PENDING";
  await assert.rejects(service.initiatePayment("customer-1", "booking-1", key), { statusCode: 409 });
  assert.equal(state.booking.paymentAttempts.length, 0);
  assert.equal(state.providerCalls, 0);
});

test("a pending cancellation review pauses new payment attempts and payment confirmation", async () => {
  const initiation = fixture({ booking: { cancellationStatus: "PENDING" } });
  await assert.rejects(
    createDinePaymentsService(initiation.database, { now: () => now, paymentProvider: initiation.provider })
      .initiatePayment("customer-1", "booking-1", key),
    { statusCode: 409, message: "Payment is paused while the Cook reviews your cancellation request." },
  );
  assert.equal(initiation.state.booking.paymentAttempts.length, 0);
  assert.equal(initiation.state.providerCalls, 0);

  const confirmation = fixture();
  const attempt = await createDinePaymentsService(confirmation.database, { now: () => now, paymentProvider: confirmation.provider })
    .initiatePayment("customer-1", "booking-1", key);
  confirmation.state.booking.cancellationStatus = "PENDING";
  await assert.rejects(
    createDinePaymentsService(confirmation.database, { now: () => now, paymentProvider: confirmation.provider })
      .confirmPayment("customer-1", "booking-1", attempt.id, "success"),
    { statusCode: 409 },
  );
  assert.equal(confirmation.state.booking.status, "ACCEPTED");
  assert.equal(confirmation.state.booking.paymentAttempts[0].status, "PENDING");
  assert.equal(confirmation.state.providerConfirmCalls, 0);
});

test("expired or incomplete payment windows are rejected without provider call or attempt row", async () => {
  for (const booking of [
    { paymentExpiresAt: now },
    { paymentExpiresAt: null },
    { acceptedAt: null },
    { totalAmountSnapshot: null },
  ]) {
    const { database, provider, state } = fixture({ booking });
    await assert.rejects(
      createDinePaymentsService(database, { now: () => now, paymentProvider: provider })
        .initiatePayment("customer-1", "booking-1", key),
      { statusCode: 409 },
    );
    assert.equal(state.booking.paymentAttempts.length, 0);
    assert.equal(state.providerCalls, 0);
  }
});

test("attempt amount, INR currency, and fixed expiry come from persisted booking snapshots", async () => {
  const { database, provider, state } = fixture();
  let providerInput;
  const wrappedProvider = { createPayment: async (input) => { providerInput = input; return provider.createPayment(input); } };
  const result = await createDinePaymentsService(database, { now: () => now, paymentProvider: wrappedProvider })
    .initiatePayment("customer-1", "booking-1", key);

  assert.deepEqual(providerInput, { amount: "250.25", currency: "INR", expiresAt: deadline });
  assert.equal(result.amount, 250.25);
  assert.equal(result.currency, "INR");
  assert.equal(result.expiresAt.toISOString(), deadline.toISOString());
  assert.equal(result.provider, "SIMULATED");
  assert.equal(result.status, "PENDING");
  assert.equal(result.verificationMode, null);
  assert.equal(result.simulated, true);
  assert.equal(state.booking.status, "ACCEPTED", "Creating an attempt must not confirm the booking.");
  assert.equal(state.booking.paymentAttempts.length, 1);
});

test("same-key retry returns the original attempt and does not create another provider intent", async () => {
  const { database, provider, state } = fixture();
  const service = createDinePaymentsService(database, { now: () => now, paymentProvider: provider });
  const first = await service.initiatePayment("customer-1", "booking-1", key);
  const retry = await service.initiatePayment("customer-1", "booking-1", key);
  assert.equal(retry.id, first.id);
  assert.equal(retry.reference, first.reference);
  assert.equal(retry.reused, true);
  assert.equal(state.booking.paymentAttempts.length, 1);
  assert.equal(state.providerCalls, 1);
});

test("a different retry key reuses a live pending attempt and attempts stop at three", async () => {
  const live = {
    id: "attempt-live", attemptNumber: 1, idempotencyKey: "previous-key", reference: "TB-SIM-OLD",
    provider: "SIMULATED", status: "PENDING", verificationMode: null, amount: "250.25",
    currency: "INR", expiresAt: deadline, createdAt: now,
  };
  const activeFixture = fixture({ attempts: [live] });
  const active = await createDinePaymentsService(activeFixture.database, { now: () => now, paymentProvider: activeFixture.provider })
    .initiatePayment("customer-1", "booking-1", key);
  assert.equal(active.id, live.id);
  assert.equal(active.reused, true);
  assert.equal(activeFixture.state.providerCalls, 0);

  const failedAttempts = [1, 2, 3].map((attemptNumber) => ({
    id: `attempt-${attemptNumber}`, attemptNumber, idempotencyKey: `failed-${attemptNumber}`,
    reference: `TB-FAILED-${attemptNumber}`, provider: "SIMULATED", status: "FAILED",
    verificationMode: null, amount: "250.25", currency: "INR", expiresAt: deadline, createdAt: now,
  }));
  const fullFixture = fixture({ attempts: failedAttempts });
  await assert.rejects(
    createDinePaymentsService(fullFixture.database, { now: () => now, paymentProvider: fullFixture.provider })
      .initiatePayment("customer-1", "booking-1", key),
    { statusCode: 409 },
  );
  assert.equal(fullFixture.state.booking.paymentAttempts.length, 3);
  assert.equal(fullFixture.state.providerCalls, 0);
});

test("concurrent initiation requests share one active attempt and cannot exceed the attempt limit", async () => {
  const { database, provider, state } = fixture();
  const service = createDinePaymentsService(database, { now: () => now, paymentProvider: provider });
  const results = await Promise.all([
    service.initiatePayment("customer-1", "booking-1", key),
    service.initiatePayment("customer-1", "booking-1", "c318d577-3db1-4612-9900-af252b9281b9"),
  ]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(state.booking.paymentAttempts.length, 1);
});

test("provider unavailability or failure leaves no payment attempt", async () => {
  const missing = fixture();
  await assert.rejects(
    createDinePaymentsService(missing.database, { now: () => now, paymentProvider: null })
      .initiatePayment("customer-1", "booking-1", key),
    { statusCode: 503 },
  );
  const failing = fixture();
  await assert.rejects(
    createDinePaymentsService(failing.database, { now: () => now, paymentProvider: { createPayment: async () => { throw new Error("provider error"); } } })
      .initiatePayment("customer-1", "booking-1", key),
    { statusCode: 503 },
  );
  const realProvider = fixture();
  await assert.rejects(
    createDinePaymentsService(realProvider.database, {
      now: () => now,
      paymentProvider: { createPayment: async ({ amount, currency, expiresAt }) => ({
        reference: "razorpay-intent",
        amount,
        currency,
        method: "RAZORPAY",
        status: "PENDING",
        expiresAt,
      }) },
    }).initiatePayment("customer-1", "booking-1", key),
    { statusCode: 503 },
  );
  assert.equal(missing.state.booking.paymentAttempts.length, 0);
  assert.equal(failing.state.booking.paymentAttempts.length, 0);
  assert.equal(realProvider.state.booking.paymentAttempts.length, 0);
});

test("mock success confirms the owned accepted booking and payment atomically without changing held seats", async () => {
  const { database, provider, state } = fixture();
  const service = createDinePaymentsService(database, { now: () => now, paymentProvider: provider });
  const attempt = await service.initiatePayment("customer-1", "booking-1", key);

  const result = await service.confirmPayment("customer-1", "booking-1", attempt.id, "success");
  assert.equal(result.booking.status, "CONFIRMED");
  assert.equal(result.paymentAttempt.status, "SUCCEEDED");
  assert.equal(result.paymentAttempt.verificationMode, "SIMULATED");
  assert.equal(result.simulated, true);
  assert.equal(state.booking.status, "CONFIRMED");
  assert.equal(state.booking.slot.availableSeats, 2, "The accepted booking already holds seats; confirmation must not decrement again.");
  assert.equal(state.events.filter(({ toStatus }) => toStatus === "SUCCEEDED").length, 1);
  assert.equal(state.notifications.length, 1);
  assert.deepEqual(state.notifications[0], {
    userId: "cook-user-1",
    portal: "COOK",
    type: "ORDER_ALERT",
    title: "Dine booking payment confirmed",
    message: "Payment was confirmed for Autumn supper. The booking is now confirmed.",
    metadata: {
      kind: "EXPERIENCE_BOOKING_PAYMENT_CONFIRMED",
      bookingId: "booking-1",
      experienceId: "experience-1",
      href: "/cook/dine-bookings",
    },
    eventKey: "experience-booking:booking-1:payment-confirmed:cook:cook-user-1",
  });
});

test("mock failure records one failed attempt without confirming or extending the original deadline and allows a bounded retry", async () => {
  const { database, provider, state } = fixture();
  const service = createDinePaymentsService(database, { now: () => now, paymentProvider: provider });
  const first = await service.initiatePayment("customer-1", "booking-1", key);
  const failed = await service.confirmPayment("customer-1", "booking-1", first.id, "failure");

  assert.equal(failed.booking.status, "ACCEPTED");
  assert.equal(failed.paymentAttempt.status, "FAILED");
  assert.equal(state.booking.status, "ACCEPTED");
  assert.equal(state.booking.paymentExpiresAt.toISOString(), deadline.toISOString());
  assert.equal(state.booking.slot.availableSeats, 2);
  assert.equal(state.events.filter(({ toStatus }) => toStatus === "FAILED").length, 1);
  assert.equal(state.notifications.length, 0, "Failed payment attempts must not notify the Cook of confirmation.");

  const retry = await service.initiatePayment("customer-1", "booking-1", "c318d577-3db1-4612-9900-af252b9281b9");
  assert.equal(retry.attemptNumber, 2);
  assert.equal(retry.expiresAt.toISOString(), deadline.toISOString());
  assert.equal(state.booking.paymentAttempts.length, 2);
});

test("confirmation enforces customer ownership and booking-attempt pairing", async () => {
  const { database, provider, state } = fixture();
  const service = createDinePaymentsService(database, { now: () => now, paymentProvider: provider });
  const attempt = await service.initiatePayment("customer-1", "booking-1", key);
  await assert.rejects(service.confirmPayment("other-customer", "booking-1", attempt.id, "success"), { statusCode: 404 });
  await assert.rejects(service.confirmPayment("customer-1", "another-booking", attempt.id, "success"), { statusCode: 404 });
  assert.equal(state.providerConfirmCalls, 0);
  assert.equal(state.booking.status, "ACCEPTED");
});

test("duplicate and concurrent confirmation cannot change a terminal payment or consume seats twice", async () => {
  const { database, provider, state } = fixture();
  const service = createDinePaymentsService(database, { now: () => now, paymentProvider: provider });
  const attempt = await service.initiatePayment("customer-1", "booking-1", key);
  const results = await Promise.all([
    service.confirmPayment("customer-1", "booking-1", attempt.id, "success"),
    service.confirmPayment("customer-1", "booking-1", attempt.id, "success"),
  ]);
  const repeated = await service.confirmPayment("customer-1", "booking-1", attempt.id, "failure");
  assert.equal(results[0].booking.status, "CONFIRMED");
  assert.equal(results[1].booking.status, "CONFIRMED");
  assert.equal(repeated.paymentAttempt.status, "SUCCEEDED");
  assert.equal(state.booking.status, "CONFIRMED");
  assert.equal(state.booking.slot.availableSeats, 2);
  assert.equal(state.events.filter(({ toStatus }) => toStatus === "SUCCEEDED").length, 1);
  assert.equal(state.events.filter(({ toStatus }) => toStatus === "FAILED").length, 0);
  assert.equal(state.notifications.length, 1, "A repeated successful confirmation must reuse one deterministic notification.");
});

test("Cook notification failure rolls payment success and booking confirmation back in the same transaction", async () => {
  const { database, provider, state } = fixture();
  const attempt = await createDinePaymentsService(database, { now: () => now, paymentProvider: provider })
    .initiatePayment("customer-1", "booking-1", key);
  const service = createDinePaymentsService(database, {
    now: () => now,
    paymentProvider: provider,
    notificationServiceFactory: () => ({ create: async () => { throw new Error("notification persistence failed"); } }),
  });

  await assert.rejects(service.confirmPayment("customer-1", "booking-1", attempt.id, "success"), /notification persistence failed/);
  assert.equal(state.booking.status, "ACCEPTED");
  assert.equal(state.booking.paymentAttempts[0].status, "PENDING");
  assert.equal(state.events.some(({ toStatus }) => toStatus === "SUCCEEDED"), false);
  assert.equal(state.notifications.length, 0);
});

test("payment-deadline expiry rejects confirmation and releases an accepted hold exactly once", async () => {
  const { database, provider, state } = fixture();
  const clock = { value: now };
  const service = createDinePaymentsService(database, { now: () => clock.value, paymentProvider: provider });
  const attempt = await service.initiatePayment("customer-1", "booking-1", key);
  clock.value = new Date(deadline.getTime() + 1);

  await assert.rejects(service.confirmPayment("customer-1", "booking-1", attempt.id, "success"), { statusCode: 409 });
  assert.equal(state.booking.status, "EXPIRED");
  assert.equal(state.booking.paymentAttempts[0].status, "EXPIRED");
  assert.equal(state.booking.slot.availableSeats, state.booking.slot.capacity);
  assert.equal(state.providerConfirmCalls, 0, "Expired attempts are rejected before the demo provider is asked to confirm.");
  assert.equal((await createDinePaymentsService(database, { now: () => clock.value, paymentProvider: provider })
    .confirmPayment("customer-1", "booking-1", attempt.id, "success").catch((error) => error.statusCode)), 409);
  assert.equal(state.booking.slot.availableSeats, state.booking.slot.capacity, "Repeated expiry cannot release seats twice.");
});

test("success fails closed when persisted slot capacity no longer accounts for held guests", async () => {
  const { database, provider, state } = fixture();
  const service = createDinePaymentsService(database, { now: () => now, paymentProvider: provider });
  const attempt = await service.initiatePayment("customer-1", "booking-1", key);
  state.booking.slot.availableSeats = 1;
  await assert.rejects(service.confirmPayment("customer-1", "booking-1", attempt.id, "success"), { statusCode: 409 });
  assert.equal(state.booking.status, "ACCEPTED");
  assert.equal(state.booking.paymentAttempts[0].status, "PENDING");
});

test("confirmation accepts only the explicit demo outcomes and mock mode is disabled in production", async () => {
  const { database, provider, state } = fixture();
  const attempt = await createDinePaymentsService(database, { now: () => now, paymentProvider: provider })
    .initiatePayment("customer-1", "booking-1", key);
  await assert.rejects(createDinePaymentsService(database, { now: () => now, paymentProvider: provider })
    .confirmPayment("customer-1", "booking-1", attempt.id, "SUCCEEDED"), { statusCode: 400 });
  await assert.rejects(createDinePaymentsService(database, { now: () => now, paymentProvider: provider, allowMockPayments: false })
    .confirmPayment("customer-1", "booking-1", attempt.id, "success"), { statusCode: 503 });
  assert.equal(state.booking.status, "ACCEPTED");
});

test("Dine payment route is behind authenticated Customer portal access and accepts no client amount", async () => {
  const { readFile } = await import("node:fs/promises");
  const routes = await readFile(new URL("../modules/events/customer-events.routes.js", import.meta.url), "utf8");
  const validation = await readFile(new URL("../modules/events/dine-bookings.validation.js", import.meta.url), "utf8");
  assert.match(routes, /router\.use\(authenticate, requireCustomerOrderAccess\)/);
  assert.match(routes, /router\.post\("\/bookings\/:id\/payment-attempts", validate\(initiateDinePaymentSchema\)/);
  assert.match(routes, /router\.post\("\/bookings\/:id\/payment-attempts\/:attemptId\/confirm", validate\(confirmDinePaymentSchema\)/);
  assert.match(validation, /initiateDinePaymentSchema[\s\S]*idempotencyKey: z\.string\(\)\.uuid\(\)/);
  assert.match(validation, /initiateDinePaymentSchema[\s\S]*\.strict\(\)/);
  assert.doesNotMatch(validation, /amount:\s*z\./);
  assert.doesNotMatch(validation, /currency:\s*z\./);
  assert.match(validation, /confirmDinePaymentSchema[\s\S]*mockOutcome: z\.enum\(\["success", "failure"\]\)/);
  assert.doesNotMatch(validation, /confirmDinePaymentSchema[\s\S]*\b(?:amount|currency|status):\s*z\./);
});

test("confirmation handles both lowercase and uppercase demo outcomes safely", async () => {
  const { database, provider } = fixture();
  const service = createDinePaymentsService(database, { now: () => now, paymentProvider: provider });
  const attempt = await service.initiatePayment("customer-1", "booking-1", key);
  const result = await service.confirmPayment("customer-1", "booking-1", attempt.id, "SUCCESS");
  assert.equal(result.booking.status, "CONFIRMED");
  assert.equal(result.paymentAttempt.status, "SUCCEEDED");
});

