import assert from "node:assert/strict";
import test from "node:test";
import { createDineBookingExpiryService, expireDueBookingsForSlot, releaseDineBookingSeats, runSerializableWithRetry } from "../modules/events/dine-booking-expiry.service.js";
import {
  REQUIRED_DINE_EXPIRY_MIGRATIONS,
  createDineBookingExpiryScheduler,
  getDineExpiryErrorDiagnostics,
  startDineBookingExpiryIfMigrated,
} from "../modules/events/dine-booking-expiry.scheduler.js";

const at = new Date("2026-10-18T12:00:00.000Z");

const fixture = ({ bookings = [], slots = [] } = {}) => {
  const state = {
    bookings: structuredClone(bookings),
    slots: new Map(slots.map((slot) => [slot.id, structuredClone(slot)])),
    notifications: [],
    attempts: bookings.flatMap((item) => item.paymentAttempts || []),
    events: [],
  };
  const tx = {};
  tx.$queryRaw = async (strings, ...values) => {
    const sql = strings.join("?");
    if (sql.includes('UPDATE "ExperienceSlot"')) {
      const [seats, slotId] = values;
      const slot = state.slots.get(slotId);
      if (!slot || !["OPEN", "PAUSED"].includes(slot.status) || slot.availableSeats + seats > slot.capacity) return [];
      slot.availableSeats += seats;
      return [{ id: slotId }];
    }
    let scopeId;
    let dueAt;
    let limit;
    if (sql.includes('"slotId" =')) [scopeId, dueAt] = values;
    else if (sql.includes('"experienceId" =')) [scopeId, dueAt] = values;
    else [dueAt, limit] = values;
    const rows = state.bookings.filter((booking) => booking.slotId
      && ((booking.status === "PENDING" && booking.holdExpiresAt instanceof Date && booking.holdExpiresAt <= dueAt)
        || (booking.status === "ACCEPTED" && booking.paymentExpiresAt instanceof Date && booking.paymentExpiresAt <= dueAt))
      && (!sql.includes('"slotId" =') || booking.slotId === scopeId)
      && (!sql.includes('"experienceId" =') || booking.experienceId === scopeId))
      .sort((left, right) => left.slotId.localeCompare(right.slotId) || left.id.localeCompare(right.id));
    return Number.isInteger(limit) ? rows.slice(0, limit) : rows;
  };
  tx.experienceBooking = {
    updateMany: async ({ where, data }) => {
      const booking = state.bookings.find((row) => row.id === where.id && row.status === where.status
        && (where.holdExpiresAt ? row.holdExpiresAt <= where.holdExpiresAt.lte
          : row.paymentExpiresAt <= where.paymentExpiresAt.lte));
      if (!booking) return { count: 0 };
      Object.assign(booking, data);
      return { count: 1 };
    },
  };
  tx.experiencePaymentAttempt = {
    findMany: async ({ where }) => state.attempts.filter((attempt) => attempt.experienceBookingId === where.experienceBookingId
      && attempt.status === where.status).map(({ id }) => ({ id })),
    updateMany: async ({ where, data }) => {
      const attempts = state.attempts.filter((attempt) => attempt.experienceBookingId === where.experienceBookingId
        && attempt.status === where.status && attempt.expiresAt <= where.expiresAt.lte);
      attempts.forEach((attempt) => Object.assign(attempt, data));
      return { count: attempts.length };
    },
  };
  tx.experiencePaymentEvent = { create: async ({ data }) => { state.events.push(data); return data; } };
  tx.userNotification = {
    upsert: async ({ where, create }) => {
      const existing = state.notifications.find((item) => item.userId === where.userId_portal_eventKey.userId
        && item.portal === where.userId_portal_eventKey.portal && item.eventKey === where.userId_portal_eventKey.eventKey);
      if (existing) return existing;
      state.notifications.push(create);
      return create;
    },
  };
  tx.experienceSlot = {
    updateMany: async ({ where, data }) => {
      const slot = state.slots.get(where.id);
      if (!slot || slot.status !== where.status) return { count: 0 };
      slot.availableSeats += data.availableSeats.increment;
      return { count: 1 };
    },
  };
  const database = {
    ...tx,
    async $transaction(operation) {
      const before = structuredClone({ bookings: state.bookings, slots: [...state.slots.entries()], attempts: state.attempts, events: state.events });
      try { return await operation(tx); }
      catch (error) {
        state.bookings = before.bookings;
        state.slots = new Map(before.slots);
        state.attempts = before.attempts;
        state.events = before.events;
        throw error;
      }
    },
  };
  return { database, state };
};

const slot = (overrides = {}) => ({ id: "slot-1", status: "OPEN", capacity: 5, availableSeats: 3, ...overrides });
const booking = (overrides = {}) => ({
  id: "booking-1", experienceId: "experience-1", slotId: "slot-1", customerId: "customer-1", numberOfGuests: 2,
  status: "PENDING", holdExpiresAt: new Date(at.getTime() - 1), ...overrides,
});

const acceptedBooking = (overrides = {}) => ({
  ...booking(),
  status: "ACCEPTED",
  holdExpiresAt: new Date(at.getTime() + 60_000),
  paymentExpiresAt: new Date(at.getTime() - 1),
  acceptedAt: new Date(at.getTime() - 15 * 60_000),
  paymentAttempts: [{ id: "attempt-1", experienceBookingId: "booking-1", status: "PENDING", expiresAt: new Date(at.getTime() - 1) }],
  ...overrides,
});

test("expiry worker releases overdue holds without a customer booking request", async () => {
  const { database, state } = fixture({ bookings: [booking()], slots: [slot()] });
  const result = await createDineBookingExpiryService(database, { now: () => at }).runBatch();
  assert.deepEqual(result, { expiredCount: 1, releasedSeats: 2 });
  assert.equal(state.bookings[0].status, "EXPIRED");
  assert.equal(state.slots.get("slot-1").availableSeats, 5);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.notifications[0].eventKey, "experience-booking:booking-1:response-timeout:customer:customer-1");
});

test("a fresh worker instance after restart finds persisted overdue holds and repeated runs release once", async () => {
  const { database, state } = fixture({ bookings: [booking()], slots: [slot()] });
  const restartedWorker = createDineBookingExpiryService(database, { now: () => at });
  assert.equal((await restartedWorker.runBatch()).expiredCount, 1);
  assert.equal((await createDineBookingExpiryService(database, { now: () => at }).runBatch()).expiredCount, 0);
  assert.equal(state.slots.get("slot-1").availableSeats, 5);
  assert.equal(state.notifications.length, 1);
});

test("future, confirmed, and legacy slotless bookings are not expired", async () => {
  const { database, state } = fixture({
    bookings: [
      booking(),
      booking({ id: "future", holdExpiresAt: new Date(at.getTime() + 1000) }),
      booking({ id: "confirmed", status: "CONFIRMED" }),
      booking({ id: "legacy", slotId: null }),
    ], slots: [slot()],
  });
  assert.deepEqual(await createDineBookingExpiryService(database, { now: () => at }).runBatch(), { expiredCount: 1, releasedSeats: 2 });
  assert.deepEqual(state.bookings.map((item) => item.status), ["EXPIRED", "PENDING", "CONFIRMED", "PENDING"]);
  assert.equal(state.slots.get("slot-1").availableSeats, 5);
});

test("expired holds restore seats for paused slots without making them bookable", async () => {
  const { database, state } = fixture({ bookings: [booking()], slots: [slot({ status: "PAUSED" })] });
  const result = await createDineBookingExpiryService(database, { now: () => at }).runBatch();
  assert.equal(result.expiredCount, 1);
  assert.equal(state.slots.get("slot-1").availableSeats, 5);
  assert.equal(state.slots.get("slot-1").status, "PAUSED");
});

test("accepted booking payment timeout expires its pending attempts and releases its hold once", async () => {
  const { database, state } = fixture({ bookings: [acceptedBooking()], slots: [slot()] });
  const result = await createDineBookingExpiryService(database, { now: () => at }).runBatch();
  assert.deepEqual(result, { expiredCount: 1, releasedSeats: 2 });
  assert.equal(state.bookings[0].status, "EXPIRED");
  assert.equal(state.attempts[0].status, "EXPIRED");
  assert.equal(state.slots.get("slot-1").availableSeats, 5);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].reasonCode, "BOOKING_PAYMENT_TIMEOUT");
  assert.equal(state.notifications[0].eventKey, "experience-booking:booking-1:payment-timeout:customer:customer-1");
  assert.deepEqual(await createDineBookingExpiryService(database, { now: () => at }).runBatch(), { expiredCount: 0, releasedSeats: 0 });
  assert.equal(state.slots.get("slot-1").availableSeats, 5);
});

test("an unpaid booking expiry closes its pending cancellation review instead of leaving it stuck", async () => {
  const pendingCancellation = booking({ cancellationStatus: "PENDING", cancellationReason: "Plans changed before the event" });
  const { database, state } = fixture({ bookings: [pendingCancellation], slots: [slot()] });

  const result = await createDineBookingExpiryService(database, { now: () => at }).runBatch();

  assert.equal(result.expiredCount, 1);
  assert.equal(state.bookings[0].status, "EXPIRED");
  assert.equal(state.bookings[0].cancellationStatus, "EXPIRED");
  assert.equal(state.slots.get("slot-1").availableSeats, 5);
  assert.equal(state.notifications.length, 1);
  assert.equal((await createDineBookingExpiryService(database, { now: () => at }).runBatch()).expiredCount, 0);
  assert.equal(state.slots.get("slot-1").availableSeats, 5);
});

test("expiry failure rolls booking state and seat release back together", async () => {
  const { database, state } = fixture({ bookings: [booking()], slots: [slot()] });
  await assert.rejects(database.$transaction(async (tx) => {
    await expireDueBookingsForSlot(tx, "slot-1", at);
    throw new Error("synthetic transaction failure");
  }), /synthetic transaction failure/);
  assert.equal(state.bookings[0].status, "PENDING");
  assert.equal(state.slots.get("slot-1").availableSeats, 3);
});

test("serialization and adapter deadlock errors receive bounded retries", async () => {
  let attempts = 0;
  const database = { $transaction: async (operation) => {
    attempts += 1;
    if (attempts < 3) throw Object.assign(new Error("transient"), {
      code: "P2010",
      meta: { driverAdapterError: { cause: { originalCode: attempts === 1 ? "40001" : "40P01" } } },
    });
    return operation({});
  } };
  assert.equal(await runSerializableWithRetry(database, async () => "done"), "done");
  assert.equal(attempts, 3);

  attempts = 0;
  await assert.rejects(runSerializableWithRetry({ $transaction: async () => {
    attempts += 1;
    throw Object.assign(new Error("deadlock"), { code: "40P01" });
  } }, async () => null), { code: "40P01" });
  assert.equal(attempts, 3);
});

test("expiry diagnostics extract supported Prisma 7 adapter shapes and only expose static categories", () => {
  assert.deepEqual(getDineExpiryErrorDiagnostics({
    code: "P2010",
    meta: { driverAdapterError: { cause: { originalCode: "42703", originalMessage: 'column "privateColumn" does not exist' } } },
    dineExpiryStage: "due-booking-lock",
  }), {
    prismaCode: "P2010",
    postgresSqlState: "42703",
    category: "undefined_column",
    stage: "due-booking-lock",
  });
  assert.deepEqual(getDineExpiryErrorDiagnostics({
    code: "P2010",
    meta: { code: "23514", message: "contains customer-specific value" },
    dineExpiryStage: "seat-release",
  }), {
    prismaCode: "P2010",
    postgresSqlState: "23514",
    category: "check_constraint_violation",
    stage: "seat-release",
  });
  assert.deepEqual(getDineExpiryErrorDiagnostics(new Error("private message")), {
    prismaCode: "unknown",
    postgresSqlState: "unknown",
    category: "unclassified_database_error",
    stage: "unknown",
  });
  const hostileShape = Object.defineProperties({}, {
    code: { get() { throw new Error("private getter failure"); } },
    meta: { get() { throw new Error("private getter failure"); } },
    dineExpiryStage: { get() { throw new Error("private getter failure"); } },
  });
  assert.deepEqual(getDineExpiryErrorDiagnostics(hostileShape), {
    prismaCode: "unknown",
    postgresSqlState: "unknown",
    category: "unclassified_database_error",
    stage: "unknown",
  });
});

test("expiry raw-query failures are tagged with safe stage labels", async () => {
  const lockFailure = Object.assign(new Error("do not expose this"), { code: "P2010" });
  const database = { $transaction: (operation) => operation({ $queryRaw: async () => { throw lockFailure; } }) };
  await assert.rejects(createDineBookingExpiryService(database).runBatch(), lockFailure);
  assert.equal(lockFailure.dineExpiryStage, "due-booking-lock");

  const releaseFailure = Object.assign(new Error("do not expose this either"), { code: "P2010" });
  await assert.rejects(releaseDineBookingSeats({ $queryRaw: async () => { throw releaseFailure; } }, "slot-secret", 1), releaseFailure);
  assert.equal(releaseFailure.dineExpiryStage, "seat-release");
});

test("scheduler coalesces overlapping local ticks and reports sanitized expiry diagnostics", async () => {
  let resolveBatch;
  let calls = 0;
  const service = { runBatch: () => { calls += 1; return new Promise((resolve) => { resolveBatch = resolve; }); } };
  const logged = [];
  let callback;
  const scheduler = createDineBookingExpiryScheduler({
    service, intervalMs: 1000, batchSize: 10,
    log: { info() {}, warn() {}, error: (...args) => logged.push(args) },
    setIntervalFn: (fn) => { callback = fn; return { unref() {} }; }, clearIntervalFn() {},
  });
  scheduler.start();
  const first = scheduler.runTick();
  const overlap = scheduler.runTick();
  assert.equal(calls, 1);
  resolveBatch({ expiredCount: 0, releasedSeats: 0 });
  await Promise.all([first, overlap]);
  callback();
  await new Promise((resolve) => setImmediate(resolve));
  resolveBatch({ expiredCount: 0, releasedSeats: 0 });
  await scheduler.stop();

  const failing = createDineBookingExpiryScheduler({
    service: { runBatch: async () => { throw Object.assign(new Error("do not log this"), {
      code: "P2010",
      meta: { driverAdapterError: { cause: { originalCode: "40P01", originalMessage: "contains private database detail" } } },
      dineExpiryStage: "seat-release",
    }); } },
    intervalMs: 1000, diagnostics: { record() {} },
    log: { info() {}, warn() {}, error: (...args) => logged.push(args) },
  });
  assert.equal((await failing.runTick()).failed, true);
  assert.deepEqual(logged.at(-1)[1], {
    errorName: "Error",
    prismaCode: "P2010",
    postgresSqlState: "40P01",
    category: "deadlock_detected",
    stage: "seat-release",
  });
  const serializedLog = JSON.stringify(logged);
  assert.equal(serializedLog.includes("do not log this"), false);
  assert.equal(serializedLog.includes("private database detail"), false);
});

test("scheduler migration gate enables and starts scheduler when all required migrations are applied", async () => {
  const diagnosticEvents = [];
  const diagnostics = { record: async (event, details) => { diagnosticEvents.push({ event, details }); } };
  const database = {
    $queryRaw: async () => REQUIRED_DINE_EXPIRY_MIGRATIONS.map((name) => ({ migration_name: name })),
  };
  const service = { runBatch: async () => ({ expiredCount: 0, releasedSeats: 0 }) };
  const running = await startDineBookingExpiryIfMigrated(database, {
    service,
    diagnostics,
    log: { info() {}, warn() {}, error() {} },
    setIntervalFn: () => ({ unref() {} }),
    clearIntervalFn: () => {},
  });
  assert.ok(running);
  assert.equal(typeof running.stop, "function");
  await running.stop();
  assert.deepEqual(diagnosticEvents, [{ event: "enabled", details: undefined }]);
});

test("scheduler migration gate stays disabled when each required migration is individually missing", async () => {
  const service = { runBatch: async () => ({ expiredCount: 0, releasedSeats: 0 }) };
  for (const missingMigration of REQUIRED_DINE_EXPIRY_MIGRATIONS) {
    const diagnosticEvents = [];
    const diagnostics = { record: async (event, details) => { diagnosticEvents.push({ event, details }); } };
    const warnings = [];
    const log = { info() {}, warn: (...args) => warnings.push(args), error() {} };
    const database = {
      $queryRaw: async () => REQUIRED_DINE_EXPIRY_MIGRATIONS
        .filter((name) => name !== missingMigration)
        .map((name) => ({ migration_name: name })),
    };
    const running = await startDineBookingExpiryIfMigrated(database, { service, diagnostics, log });
    assert.equal(running, null, `Scheduler must not start when ${missingMigration} is missing`);
    assert.deepEqual(diagnosticEvents, [{ event: "disabled", details: undefined }]);
    assert.equal(warnings.length, 1);
  }
});

test("scheduler migration gate stays disabled on empty migration results", async () => {
  const diagnosticEvents = [];
  const diagnostics = { record: async (event, details) => { diagnosticEvents.push({ event, details }); } };
  const database = { $queryRaw: async () => [] };
  const service = { runBatch: async () => ({ expiredCount: 0, releasedSeats: 0 }) };
  const running = await startDineBookingExpiryIfMigrated(database, {
    service,
    diagnostics,
    log: { info() {}, warn() {}, error() {} },
  });
  assert.equal(running, null);
  assert.deepEqual(diagnosticEvents, [{ event: "disabled", details: undefined }]);
});

test("scheduler migration gate records check-failed when migration query throws", async () => {
  const diagnosticEvents = [];
  const diagnostics = { record: async (event, details) => { diagnosticEvents.push({ event, details }); } };
  const database = {
    $queryRaw: async () => {
      throw Object.assign(new Error("migration query failed"), {
        code: "P2010",
        meta: { driverAdapterError: { cause: { originalCode: "42P01" } } },
      });
    },
  };
  const service = { runBatch: async () => ({ expiredCount: 0, releasedSeats: 0 }) };
  const running = await startDineBookingExpiryIfMigrated(database, {
    service,
    diagnostics,
    log: { info() {}, warn() {}, error() {} },
  });
  assert.equal(running, null);
  assert.equal(diagnosticEvents.length, 1);
  assert.equal(diagnosticEvents[0].event, "check-failed");
  assert.equal(diagnosticEvents[0].details.prismaCode, "P2010");
  assert.equal(diagnosticEvents[0].details.postgresSqlState, "42P01");
  assert.equal(diagnosticEvents[0].details.category, "undefined_table");
});

