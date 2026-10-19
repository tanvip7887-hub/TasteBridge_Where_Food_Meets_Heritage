import assert from "node:assert/strict";
import test from "node:test";
import { createDineCookDecisionsService } from "../modules/events/dine-cook-decisions.service.js";

const at = new Date("2026-10-18T12:00:00.000Z");

const fixture = ({ booking = {}, slot = {}, settings = {}, notificationFails = false } = {}) => {
  let currentTime = at;
  const state = {
    booking: {
      id: "booking-1", experienceId: "experience-1", customerId: "customer-1", cookId: "cook-1",
      slotId: "slot-1", bookingDate: new Date("2026-10-20T12:00:00.000Z"), numberOfGuests: 2,
      totalAmount: 250, status: "PENDING", holdExpiresAt: new Date("2026-10-19T12:00:00.000Z"),
      acceptedAt: null, rejectedAt: null, paymentExpiresAt: null, expiredAt: null, createdAt: at,
      ...booking,
    },
    slot: {
      id: "slot-1", startsAt: new Date("2026-10-20T12:00:00.000Z"), capacity: 6,
      availableSeats: 4, status: "OPEN", ...slot,
    },
    notifications: [],
  };
  const settingsRow = {
    experiencePaymentHoldMinutes: 15,
    experienceBookingCutoffHours: 6,
    ...settings,
  };
  const tx = {};
  tx.$queryRaw = async (strings, ...values) => {
    const sql = strings.join("?");
    if (sql.includes('UPDATE "ExperienceSlot"')) {
      const [slotId, seats] = [values[1], values[0]];
      if (slotId !== state.slot.id || !["OPEN", "PAUSED"].includes(state.slot.status)
        || state.slot.availableSeats + seats > state.slot.capacity) return [];
      state.slot.availableSeats += seats;
      return [{ id: slotId }];
    }
    if (sql.includes('FROM "ExperienceBooking"')) {
      const [slotId, dueAt] = values;
      return state.booking.slotId === slotId && state.booking.status === "PENDING"
        && state.booking.holdExpiresAt <= dueAt
        ? [{ id: state.booking.id, slotId, customerId: state.booking.customerId, numberOfGuests: state.booking.numberOfGuests }]
        : [];
    }
    return [];
  };
  tx.experienceBooking = {
    findFirst: async ({ where }) => {
      const bookingRow = state.booking;
      if (where.id !== bookingRow.id || where.experience?.cookId !== bookingRow.cookId
        || (where.status && where.status !== bookingRow.status)) return null;
      return {
        ...bookingRow,
        experience: { id: bookingRow.experienceId, cookId: bookingRow.cookId, title: "Sunday table" },
        slot: bookingRow.slotId ? state.slot : null,
      };
    },
    findUnique: async ({ where }) => where.id === state.booking.id ? { ...state.booking } : null,
    updateMany: async ({ where, data }) => {
      const bookingRow = state.booking;
      if (where.id !== bookingRow.id || where.status !== bookingRow.status) return { count: 0 };
      if (where.holdExpiresAt?.gt && !(bookingRow.holdExpiresAt > where.holdExpiresAt.gt)) return { count: 0 };
      if (where.holdExpiresAt?.lte && !(bookingRow.holdExpiresAt <= where.holdExpiresAt.lte)) return { count: 0 };
      Object.assign(bookingRow, data);
      return { count: 1 };
    },
  };
  tx.platformSettings = { findUnique: async () => settingsRow };
  tx.userNotification = {
    upsert: async ({ where, create }) => {
      if (notificationFails) throw new Error("notification insert failed");
      const key = where.userId_portal_eventKey;
      const existing = state.notifications.find((item) => item.userId === key.userId && item.portal === key.portal && item.eventKey === key.eventKey);
      if (existing) return existing;
      state.notifications.push(create);
      return create;
    },
  };

  let tail = Promise.resolve();
  const database = {
    $transaction: async (operation) => {
      let unlock;
      const prior = tail;
      tail = new Promise((resolve) => { unlock = resolve; });
      await prior;
      const before = structuredClone(state);
      try { return await operation(tx); }
      catch (error) { Object.assign(state, before); throw error; }
      finally { unlock(); }
    },
  };
  return {
    database,
    state,
    setNow: (value) => { currentTime = value; },
    service: () => createDineCookDecisionsService(database, { now: () => currentTime }),
  };
};

test("only the owning Cook can decide a booking; route is protected by approved-Cook middleware", async () => {
  const { service, state } = fixture();
  await assert.rejects(service().acceptBooking({ bookingId: "booking-1", cookId: "other-cook" }), { statusCode: 404 });
  await assert.rejects(service().rejectBooking({ bookingId: "booking-1", cookId: null }), { statusCode: 403 });
  assert.equal(state.booking.status, "PENDING");
  const routes = await (await import("node:fs/promises")).readFile(new URL("../modules/cook/cook.routes.js", import.meta.url), "utf8");
  assert.match(routes, /router\.patch\("\/experience-bookings\/:id\/accept", requireApprovedCook/);
  assert.match(routes, /router\.patch\("\/experience-bookings\/:id\/reject", requireApprovedCook/);
});

test("acceptance sets one fixed 15-minute deadline and retries never extend it", async () => {
  const { service, state, setNow } = fixture();
  const first = await service().acceptBooking({ bookingId: "booking-1", cookId: "cook-1" });
  assert.equal(first.status, "ACCEPTED");
  assert.equal(first.acceptedAt.toISOString(), at.toISOString());
  assert.equal(first.paymentExpiresAt.toISOString(), "2026-10-18T12:15:00.000Z");
  setNow(new Date("2026-10-18T12:10:00.000Z"));
  const retry = await service().acceptBooking({ bookingId: "booking-1", cookId: "cook-1" });
  assert.equal(retry.paymentExpiresAt.toISOString(), first.paymentExpiresAt.toISOString());
  assert.equal(state.notifications.length, 1);
  assert.equal(state.notifications[0].eventKey, "experience-booking:booking-1:cook-accepted:customer:customer-1");
  assert.equal(state.slot.availableSeats, 4);
});

test("rejection releases seats and notifies once across repeated and concurrent requests", async () => {
  const { service, state } = fixture();
  const [first, duplicate] = await Promise.all([
    service().rejectBooking({ bookingId: "booking-1", cookId: "cook-1" }),
    service().rejectBooking({ bookingId: "booking-1", cookId: "cook-1" }),
  ]);
  assert.equal(first.status, "REJECTED");
  assert.equal(duplicate.status, "REJECTED");
  assert.equal(state.booking.rejectedAt.toISOString(), at.toISOString());
  assert.equal(state.slot.availableSeats, state.slot.capacity);
  assert.equal(state.notifications.length, 1);
  await assert.rejects(service().acceptBooking({ bookingId: "booking-1", cookId: "cook-1" }), { statusCode: 409 });
  assert.equal(state.slot.availableSeats, state.slot.capacity);
});

test("a response timeout wins after its deadline and releases seats exactly once", async () => {
  const { service, state } = fixture({ booking: { holdExpiresAt: new Date(at.getTime() - 1) } });
  await assert.rejects(service().rejectBooking({ bookingId: "booking-1", cookId: "cook-1" }), /response window has expired/);
  assert.equal(state.booking.status, "EXPIRED");
  assert.equal(state.slot.availableSeats, state.slot.capacity);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.notifications[0].eventKey, "experience-booking:booking-1:response-timeout:customer:customer-1");
  await assert.rejects(service().acceptBooking({ bookingId: "booking-1", cookId: "cook-1" }), { statusCode: 409 });
  assert.equal(state.slot.availableSeats, state.slot.capacity);
  assert.equal(state.notifications.length, 1);
});

test("an acceptance that cannot complete its fixed payment window before the cutoff is rejected", async () => {
  const { service, state } = fixture({ slot: { startsAt: new Date("2026-10-18T18:10:00.000Z") } });
  await assert.rejects(service().acceptBooking({ bookingId: "booking-1", cookId: "cook-1" }), /payment window before the booking cutoff/);
  assert.equal(state.booking.status, "PENDING");
  assert.equal(state.slot.availableSeats, 4);
});

test("a failed transactional notification rolls back acceptance or rejection and seat release", async () => {
  for (const decision of ["acceptBooking", "rejectBooking"]) {
    const { service, state } = fixture({ notificationFails: true });
    await assert.rejects(service()[decision]({ bookingId: "booking-1", cookId: "cook-1" }), /notification insert failed/);
    assert.equal(state.booking.status, "PENDING");
    assert.equal(state.slot.availableSeats, 4);
    assert.equal(state.notifications.length, 0);
  }
});
