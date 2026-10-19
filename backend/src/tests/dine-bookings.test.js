import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDineBookingsService } from "../modules/events/dine-bookings.service.js";
import { createDineBookingSchema } from "../modules/events/dine-bookings.validation.js";

const at = new Date("2026-10-18T12:00:00.000Z");
const request = (overrides = {}) => ({
  experienceId: "experience-1",
  slotId: "slot-1",
  numberOfGuests: 2,
  idempotencyKey: "request-key-0001",
  ...overrides,
});

const fixture = ({
  experience = {}, slot = {}, settings = {}, notify = async (item) => item,
} = {}) => {
  const state = {
    experience: {
      id: "experience-1", type: "HOME_DINING", status: "PUBLISHED", pricePerPerson: 125.50, maxGuests: 6,
      title: "Sunday table", theme: "Family recipes", description: "A detailed dining experience description.",
      teachingContent: "Prepare and cook the workshop recipes.", learningOutcomes: "Learn the techniques covered in this session.",
      cuisine: "Maharashtrian", publicArea: "Kothrud, Pune", privateAddress: "Private synthetic address",
      addressSource: "CUSTOM", photos: ["photo"], image: "photo", menuNotes: "Seasonal menu", menuItems: [],
      cookId: "cook-1", cook: { id: "cook-1", userId: "cook-user-1", user: { role: "COOK", status: "ACTIVE" } },
      ...experience,
    },
    slot: {
      id: "slot-1", experienceId: "experience-1", startsAt: new Date("2026-10-20T12:00:00.000Z"),
      endsAt: new Date("2026-10-20T14:00:00.000Z"), capacity: 6, availableSeats: 6, status: "OPEN", ...slot,
    },
    bookings: [], notifications: [],
  };
  let nextId = 0;
  let failNotification = false;
  const tx = {};
  tx.$queryRaw = async (strings, ...values) => {
    const sql = strings.join("?");
    if (sql.includes('UPDATE "ExperienceSlot"')) {
      const [seats, slotId] = values;
      if (slotId !== state.slot.id || state.slot.status !== "OPEN" || state.slot.availableSeats + seats > state.slot.capacity) return [];
      state.slot.availableSeats += seats;
      return [{ id: slotId }];
    }
    if (sql.includes('FROM "ExperienceBooking"')) {
      const [scopeId, at] = values;
      return state.bookings.filter((booking) => booking.status === "PENDING" && booking.slotId
        && booking.holdExpiresAt instanceof Date && booking.holdExpiresAt <= (at || scopeId)
        && (sql.includes('"slotId" =') ? booking.slotId === scopeId : !sql.includes('"experienceId" =') || booking.experienceId === scopeId))
        .sort((left, right) => left.slotId.localeCompare(right.slotId) || left.id.localeCompare(right.id));
    }
    return [{ id: state.experience.id }];
  };
  tx.experience = { findFirst: async ({ where }) => (where.id === state.experience.id && state.experience.status === where.status ? state.experience : null) };
  tx.experienceSlot = {
    findFirst: async ({ where }) => where.id === state.slot.id && where.experienceId === state.slot.experienceId && where.status === state.slot.status ? state.slot : null,
    findUnique: async ({ where }) => where.id === state.slot.id ? state.slot : null,
    updateMany: async ({ where, data }) => {
      const slotRow = state.slot;
      if (where.id !== slotRow.id || where.experienceId !== slotRow.experienceId || where.status !== slotRow.status
        || slotRow.startsAt <= where.startsAt.gt || slotRow.availableSeats < where.availableSeats.gte
        || state.experience.status !== "PUBLISHED") return { count: 0 };
      slotRow.availableSeats -= data.availableSeats.decrement;
      return { count: 1 };
    },
    update: async ({ where, data }) => {
      assert.equal(where.id, state.slot.id);
      if (data.availableSeats?.increment) state.slot.availableSeats += data.availableSeats.increment;
      return state.slot;
    },
    updateMany: async ({ where, data }) => {
      if (where.id !== state.slot.id || (where.status && where.status !== state.slot.status)) return { count: 0 };
      if (data.availableSeats?.increment) state.slot.availableSeats += data.availableSeats.increment;
      if (data.availableSeats?.decrement) state.slot.availableSeats -= data.availableSeats.decrement;
      if (typeof data.availableSeats === "number") state.slot.availableSeats = data.availableSeats;
      if (typeof data.capacity === "number") state.slot.capacity = data.capacity;
      if (data.startsAt) state.slot.startsAt = data.startsAt;
      if (data.endsAt) state.slot.endsAt = data.endsAt;
      if (data.status) state.slot.status = data.status;
      return { count: 1 };
    },
  };
  tx.experienceBooking = {
    findFirst: async ({ where }) => state.bookings.find((booking) => booking.customerId === where.customerId && booking.idempotencyKey === where.idempotencyKey) || null,
    findMany: async ({ where }) => state.bookings.filter((booking) => booking.slotId === where.slotId && booking.status === where.status && booking.holdExpiresAt <= where.holdExpiresAt.lte),
    create: async ({ data }) => {
      const booking = { id: `booking-${++nextId}`, customerId: "customer-1", createdAt: at, ...data };
      state.bookings.push(booking);
      return booking;
    },
    updateMany: async ({ where, data }) => {
      const booking = state.bookings.find((item) => item.id === where.id && item.status === where.status && item.holdExpiresAt <= where.holdExpiresAt.lte);
      if (!booking) return { count: 0 };
      Object.assign(booking, data);
      return { count: 1 };
    },
  };
  tx.platformSettings = { findUnique: async () => ({ experienceCookResponseWindowHours: 24, experienceBookingCutoffHours: 6, experiencePaymentHoldMinutes: 15, ...settings }) };
  tx.userNotification = { create: async ({ data }) => { if (failNotification) throw new Error("notification insert failed"); state.notifications.push(data); return data; } };
  const database = {
    ...tx,
    $transaction: async (callback) => {
      const before = structuredClone(state);
      try { return await callback(tx); }
      catch (error) { Object.assign(state, before); throw error; }
    },
  };
  const notificationServiceFactory = (client) => ({ create: async (data) => {
    if (failNotification) throw new Error("notification insert failed");
    const event = { ...data };
    if (!client.notifications) state.notifications.push(event);
    else state.notifications.push(event);
    return notify(event);
  } });
  return {
    database, state,
    failNotification: () => { failNotification = true; },
    service: (options = {}) => createDineBookingsService(database, {
      now: () => at,
      readiness: () => ({ readyToSell: true, pendingRequirements: [] }),
      notificationServiceFactory,
      ...options,
    }),
  };
};

test("Dine booking schema requires an explicit slot, bounded guests, and an idempotency key", () => {
  assert.equal(createDineBookingSchema.body.safeParse(request()).success, true);
  assert.equal(createDineBookingSchema.body.safeParse({ ...request(), numberOfGuests: 1 }).success, true);
  assert.equal(createDineBookingSchema.body.safeParse({ ...request(), numberOfGuests: 3 }).success, true);
  assert.equal(createDineBookingSchema.body.safeParse({ ...request(), numberOfGuests: 4 }).success, false);
  assert.equal(createDineBookingSchema.body.safeParse({ ...request(), slotId: undefined }).success, false);
  assert.equal(createDineBookingSchema.body.safeParse({ ...request(), numberOfGuests: 0 }).success, false);
  assert.equal(createDineBookingSchema.body.safeParse({ ...request(), idempotencyKey: "x" }).success, false);
  assert.equal(createDineBookingSchema.body.safeParse({ ...request(), customerId: "other-customer" }).success, false);
});

test("guest counts 1 to 3 calculate price correctly, 4 is rejected, and seat boundaries are enforced", async () => {
  const { service, state } = fixture({ slot: { availableSeats: 5 } });

  // 1 guest: pricePerPerson * 1 = 125.50
  const book1 = await service().createBooking("customer-1", request({ numberOfGuests: 1, idempotencyKey: "key-guest-1" }));
  assert.equal(book1.numberOfGuests, 1);
  assert.equal(book1.totalAmount, 125.5);
  assert.equal(state.bookings[0].totalAmountSnapshot, "125.50");
  assert.equal(state.slot.availableSeats, 4);

  // 2 guests: pricePerPerson * 2 = 251.00
  const book2 = await service().createBooking("customer-1", request({ numberOfGuests: 2, idempotencyKey: "key-guest-2" }));
  assert.equal(book2.numberOfGuests, 2);
  assert.equal(book2.totalAmount, 251);
  assert.equal(state.bookings[1].totalAmountSnapshot, "251.00");
  assert.equal(state.slot.availableSeats, 2);

  // 4 guests: rejected by service-level validation
  await assert.rejects(
    service().createBooking("customer-1", request({ numberOfGuests: 4, idempotencyKey: "key-guest-4" })),
    { statusCode: 400 },
  );

  // Available seats fewer than requested (remaining seats = 2, requested = 3) -> rejected
  await assert.rejects(
    service().createBooking("customer-1", request({ numberOfGuests: 3, idempotencyKey: "key-guest-3-fail" })),
    { statusCode: 409 },
  );

  // Available seats equal to requested count (remaining seats = 2, requested = 2) -> succeeds, seats = 0
  const bookEqual = await service().createBooking("customer-1", request({ numberOfGuests: 2, idempotencyKey: "key-guest-equal" }));
  assert.equal(bookEqual.numberOfGuests, 2);
  assert.equal(state.slot.availableSeats, 0);
});

test("booking atomically holds seats and snapshots the server price and deadline", async () => {
  const { service, state } = fixture();
  const result = await service().createBooking("customer-1", request());
  assert.equal(result.status, "PENDING");
  assert.equal(result.numberOfGuests, 2);
  assert.equal(result.pricePerPerson, 125.5);
  assert.equal(result.totalAmount, 251);
  assert.equal(result.holdExpiresAt.toISOString(), "2026-10-19T12:00:00.000Z");
  assert.equal(Object.hasOwn(result, "privateAddress"), false);
  assert.equal(state.slot.availableSeats, 4);
  assert.equal(state.bookings[0].pricePerPersonSnapshot, "125.50");
  assert.equal(state.bookings[0].totalAmountSnapshot, "251.00");
  assert.equal(state.notifications.length, 1);
  assert.equal(state.notifications[0].portal, "COOK");
  assert.equal(state.notifications[0].userId, "cook-user-1");
  assert.equal(state.notifications[0].eventKey, "experience-booking:booking-1:requested:cook:cook-user-1");
});

test("Cook response deadline reserves the full configured payment window before the six-hour cutoff", async () => {
  const startsAt = new Date("2026-10-19T18:10:00.000Z");
  const { service } = fixture({ slot: { startsAt, endsAt: new Date("2026-10-19T20:10:00.000Z") } });
  const result = await service().createBooking("customer-1", request());
  assert.equal(result.holdExpiresAt.toISOString(), "2026-10-19T11:55:00.000Z");
});

test("booking rejects missing customer, unpublished or unready experience, invalid guest limits, closed slots, and cutoff violations", async () => {
  await assert.rejects(fixture().service().createBooking(null, request()), { statusCode: 403 });
  await assert.rejects(fixture({ experience: { status: "PAUSED" } }).service().createBooking("customer-1", request()), { statusCode: 404 });
  await assert.rejects(fixture().service({ readiness: () => ({ readyToSell: false }) }).createBooking("customer-1", request()), { statusCode: 409 });
  await assert.rejects(fixture({ experience: { maxGuests: 1 } }).service().createBooking("customer-1", request()), { statusCode: 400 });
  await assert.rejects(fixture({ slot: { status: "PAUSED" } }).service().createBooking("customer-1", request()), { statusCode: 404 });
  await assert.rejects(fixture({ slot: { startsAt: new Date("2026-10-18T17:00:00.000Z") } }).service().createBooking("customer-1", request()), { statusCode: 409 });
});

test("workshops remain hidden from booking until Admin review publishes them", async () => {
  const pending = fixture({ experience: { type: "WORKSHOP", status: "PENDING" } });
  await assert.rejects(pending.service().createBooking("customer-1", request()), { statusCode: 404 });
  assert.equal(pending.state.slot.availableSeats, 6);
  assert.equal(pending.state.bookings.length, 0);

  const approved = fixture({ experience: { type: "WORKSHOP", status: "PUBLISHED" } });
  const booking = await approved.service().createBooking("customer-1", request());
  assert.equal(booking.status, "PENDING");
  assert.equal(approved.state.bookings.length, 1);
  assert.equal(approved.state.slot.availableSeats, 4);
});

test("same customer retry returns the same booking without decrementing seats twice", async () => {
  const { service, state } = fixture();
  const bookings = service();
  const first = await bookings.createBooking("customer-1", request());
  const retry = await bookings.createBooking("customer-1", request());
  assert.equal(retry.id, first.id);
  assert.equal(state.bookings.length, 1);
  assert.equal(state.slot.availableSeats, 4);
  assert.equal(state.notifications.length, 1);
});

test("idempotency key reuse with a different request payload is rejected", async () => {
  const { service, state } = fixture();
  await service().createBooking("customer-1", request());
  await assert.rejects(service().createBooking("customer-1", request({ numberOfGuests: 3 })), /different booking request/);
  assert.equal(state.slot.availableSeats, 4);
  assert.equal(state.bookings.length, 1);
});

test("expired holds are released once before a later request uses the slot", async () => {
  const { service, state } = fixture({ slot: { availableSeats: 2 } });
  state.bookings.push({ id: "old-booking", customerId: "customer-old", experienceId: "experience-1", slotId: "slot-1", numberOfGuests: 2, status: "PENDING", holdExpiresAt: new Date(at.getTime() - 1) });
  const result = await service().createBooking("customer-1", request({ numberOfGuests: 3 }));
  assert.equal(result.status, "PENDING");
  assert.equal(state.bookings[0].status, "EXPIRED");
  assert.equal(state.slot.availableSeats, 1);
});

test("retrying the original idempotency key after expiry returns the expired booking without another release", async () => {
  const { service, state } = fixture({ slot: { availableSeats: 4 } });
  const original = {
    id: "old-booking", customerId: "customer-1", experienceId: "experience-1", slotId: "slot-1",
    numberOfGuests: 2, status: "PENDING", idempotencyKey: "request-key-0001",
    requestFingerprint: createHash("sha256").update(JSON.stringify({ experienceId: "experience-1", slotId: "slot-1", numberOfGuests: 2 })).digest("hex"),
    holdExpiresAt: new Date(at.getTime() - 1),
    pricePerPersonSnapshot: "125.50", totalAmountSnapshot: "251.00", totalAmount: 251,
    bookingDate: state.slot.startsAt, createdAt: at,
  };
  state.bookings.push(original);
  const retry = await service().createBooking("customer-1", request());
  assert.equal(retry.id, "old-booking");
  assert.equal(retry.status, "EXPIRED");
  assert.equal(original.expiredAt.toISOString(), at.toISOString());
  assert.equal(state.slot.availableSeats, 6);
  assert.equal(state.bookings.length, 1);
});

test("failed Cook notification rolls back both booking creation and seat decrement", async () => {
  const { service, state, failNotification } = fixture();
  failNotification();
  await assert.rejects(service().createBooking("customer-1", request()), /notification insert failed/);
  assert.equal(state.slot.availableSeats, 6);
  assert.equal(state.bookings.length, 0);
  assert.equal(state.notifications.length, 0);
});

test("customer booking route uses the authenticated identity and customer access middleware", async () => {
  const routes = await readFile(new URL("../modules/events/customer-events.routes.js", import.meta.url), "utf8");
  const controller = await readFile(new URL("../modules/events/customer-events.controller.js", import.meta.url), "utf8");
  assert.match(routes, /router\.use\(authenticate, requireCustomerOrderAccess\)/);
  assert.match(routes, /router\.post\("\/bookings", validate\(createDineBookingSchema\), createMyDineBooking\)/);
  assert.match(controller, /dineBookings\.createBooking\(req\.user\.id, req\.body\)/);
  assert.doesNotMatch(controller, /req\.body\.customerId|req\.query\.customerId/);
});
