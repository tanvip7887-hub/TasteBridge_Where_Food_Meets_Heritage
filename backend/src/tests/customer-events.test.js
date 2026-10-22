import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createCustomerEventsService } from "../modules/events/customer-events.service.js";
import { requireCustomerOrderAccess } from "../modules/orders/orders.auth.js";

const records = [
  {
    id: "booking-workshop", experienceId: "experience-workshop", bookingDate: new Date("2026-11-15T04:30:00.000Z"),
    numberOfGuests: 2, totalAmount: 800, status: "CONFIRMED", createdAt: new Date("2026-10-10T00:00:00.000Z"),
    paymentExpiresAt: null, paymentAttempts: [],
    customerId: "customer-a", experience: { title: "Regional cooking workshop", location: "Pune kitchen", type: "WORKSHOP" },
  },
  {
    id: "booking-dining", experienceId: "experience-dining", bookingDate: new Date("2026-10-01T14:00:00.000Z"),
    numberOfGuests: 1, totalAmount: 500, status: "CANCELLED", createdAt: new Date("2026-09-10T00:00:00.000Z"),
    paymentExpiresAt: null, paymentAttempts: [],
    customerId: "customer-a", experience: { title: "Heritage dining evening", location: "Katraj", type: "HOME_DINING" },
  },
  {
    id: "other-customer-booking", experienceId: "experience-other", bookingDate: new Date("2026-11-20T00:00:00.000Z"),
    numberOfGuests: 3, totalAmount: 900, status: "CONFIRMED", customerId: "customer-b",
    paymentExpiresAt: null, paymentAttempts: [],
    experience: { title: "Private booking", location: "Pune", type: "HOME_DINING" },
  },
];

test("My Events reads workshop and dining records from ExperienceBooking, scoped to the authenticated customer", async () => {
  let query;
  const service = createCustomerEventsService({ experienceBooking: { findMany: async (input) => {
    query = input;
    return records.filter((record) => record.customerId === input.where.customerId);
  } } });

  const result = await service.listMyBookings("customer-a");
  assert.deepEqual(query.where, { customerId: "customer-a" });
  assert.deepEqual(query.orderBy, [{ bookingDate: "asc" }, { id: "asc" }]);
  assert.deepEqual(result.items.map(({ id, title, eventType, status, venue, referenceId }) => ({ id, title, eventType, status, venue, referenceId })), [
    { id: "booking-workshop", title: "Regional cooking workshop", eventType: "WORKSHOP", status: "CONFIRMED", venue: "Pune kitchen", referenceId: "booking-workshop" },
    { id: "booking-dining", title: "Heritage dining evening", eventType: "HOME_DINING", status: "CANCELLED", venue: "Katraj", referenceId: "booking-dining" },
  ]);
  assert.ok(result.items.every((booking) => booking.id !== "other-customer-booking"));
});

test("dedicated customer booking lists filter by authenticated customer and fixed persisted experience type", async () => {
  const queries = [];
  const service = createCustomerEventsService({ experienceBooking: { findMany: async (input) => {
    queries.push(input.where);
    return records.filter((record) => record.customerId === input.where.customerId
      && (!input.where.experience || record.experience.type === input.where.experience.type));
  } } });
  const dine = await service.listMyBookings("customer-a", "HOME_DINING");
  const workshops = await service.listMyBookings("customer-a", "WORKSHOP");
  assert.deepEqual(queries, [
    { customerId: "customer-a", experience: { type: "HOME_DINING" } },
    { customerId: "customer-a", experience: { type: "WORKSHOP" } },
  ]);
  assert.deepEqual(dine.items.map((booking) => booking.eventType), ["HOME_DINING"]);
  assert.deepEqual(workshops.items.map((booking) => booking.eventType), ["WORKSHOP"]);
});

test("customer booking response exposes only the three public experience and kitchen image/name fields", async () => {
  const privateCookValue = "private-cook-contact-marker";
  let query;
  const service = createCustomerEventsService({
    experienceBooking: { findMany: async (input) => {
      query = input;
      return [{
        ...records[1],
        experience: {
          ...records[1].experience,
          image: "https://res.cloudinary.com/tastebridge/image/upload/v123/dine.jpg",
          cook: {
            businessName: "Warm Kitchen",
            profileImage: "https://res.cloudinary.com/tastebridge/image/upload/v123/kitchen.jpg",
            phone: privateCookValue,
            email: privateCookValue,
            privateAddress: privateCookValue,
            fssaiNumber: privateCookValue,
          },
        },
      }];
    } },
  });

  const [booking] = (await service.listMyBookings("customer-a", "HOME_DINING")).items;
  assert.deepEqual(query.select.experience.select, {
    title: true,
    location: true,
    type: true,
    theme: true,
    cuisine: true,
    image: true,
    photos: true,
    menuItems: {
      orderBy: { sortOrder: "asc" },
      select: { dish: { select: { name: true, image: true, cuisine: true } } },
    },
    cook: { select: { businessName: true, profileImage: true } },
  });
  assert.equal(booking.kitchenName, "Warm Kitchen");
  assert.equal(booking.kitchenPhotoUrl, "https://res.cloudinary.com/tastebridge/image/upload/v123/kitchen.jpg");
  assert.equal(booking.experienceImageUrl, "https://res.cloudinary.com/tastebridge/image/upload/v123/dine.jpg");
  assert.equal(JSON.stringify(booking).includes(privateCookValue), false);
  assert.deepEqual(Object.keys(booking).filter((key) => ["kitchenName", "kitchenPhotoUrl", "experienceImageUrl"].includes(key)), [
    "kitchenName", "kitchenPhotoUrl", "experienceImageUrl",
  ]);
});

test("Dine booking thumbnail matches Explore's curated image for the selected theme", async () => {
  const service = createCustomerEventsService({
    experienceBooking: { findMany: async () => [{
      ...records[1],
      experience: {
        ...records[1].experience,
        theme: "Gujarati",
        image: "https://res.cloudinary.com/tastebridge/image/upload/v123/cook-photo.jpg",
        photos: ["https://res.cloudinary.com/tastebridge/image/upload/v123/cook-photo.jpg"],
        cook: { businessName: "Warm Kitchen", profileImage: "https://res.cloudinary.com/tastebridge/image/upload/v123/cook-photo.jpg" },
      },
    }] },
    foodCategory: { findMany: async () => [{
      name: "Gujarati",
      slug: "gujarati",
      image: "https://res.cloudinary.com/tastebridge/image/upload/v123/different-category-image.jpg",
    }] },
  });

  const [booking] = (await service.listMyBookings("customer-a", "HOME_DINING")).items;
  assert.equal(booking.experienceImageUrl, "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/52/Ahmedabad-gujarati_thali.jpg/960px-Ahmedabad-gujarati_thali.jpg");
  assert.equal(booking.theme, undefined);
  assert.deepEqual(Object.keys(booking).filter((key) => ["kitchenName", "kitchenPhotoUrl", "experienceImageUrl"].includes(key)), [
    "kitchenName", "kitchenPhotoUrl", "experienceImageUrl",
  ]);
});

test("Dine booking image matches Explore's first matching menu-dish image", async () => {
  const dishImage = "https://res.cloudinary.com/tastebridge/image/upload/v123/gujarati-dish.jpg";
  const service = createCustomerEventsService({
    experienceBooking: { findMany: async () => [{
      ...records[1],
      experience: {
        ...records[1].experience,
        theme: "Gujarati",
        cuisine: "Gujarati",
        image: "https://res.cloudinary.com/tastebridge/image/upload/v123/cook-photo.jpg",
        menuItems: [{ dish: { name: "Dhokla", cuisine: "Gujarati", image: dishImage } }],
        cook: { businessName: "Warm Kitchen", profileImage: null },
      },
    }] },
  });

  const [booking] = (await service.listMyBookings("customer-a", "HOME_DINING")).items;
  assert.equal(booking.experienceImageUrl, dishImage);
});

test("customer booking response suppresses malformed or non-public image URLs", async () => {
  const service = createCustomerEventsService({
    experienceBooking: { findMany: async () => [{
      ...records[1],
      experience: { ...records[1].experience, image: "http://localhost/private.jpg", cook: { businessName: "Test Kitchen", profileImage: "file:///private.jpg" } },
    }] },
  });
  const [booking] = (await service.listMyBookings("customer-a", "HOME_DINING")).items;
  assert.equal(booking.kitchenName, "Test Kitchen");
  assert.equal(booking.kitchenPhotoUrl, null);
  assert.equal(booking.experienceImageUrl, null);
});

test("My Events returns an empty list for a customer without bookings", async () => {
  const service = createCustomerEventsService({ experienceBooking: { findMany: async ({ where }) => {
    assert.deepEqual(where, { customerId: "customer-empty" });
    return [];
  } } }, { now: () => new Date("2026-10-18T12:00:00.000Z") });
  assert.deepEqual(await service.listMyBookings("customer-empty"), { serverTime: new Date("2026-10-18T12:00:00.000Z"), items: [] });
});

test("My Events returns the fixed Dine payment deadline and only safe owner-scoped attempt fields", async () => {
  const deadline = new Date("2026-11-10T10:15:00.000Z");
  const attempt = { id: "attempt-1", attemptNumber: 2, status: "FAILED", expiresAt: deadline, createdAt: new Date("2026-11-10T10:02:00.000Z") };
  let query;
  const service = createCustomerEventsService({ experienceBooking: { findMany: async (input) => {
    query = input;
    return [{ ...records[0], status: "ACCEPTED", paymentExpiresAt: deadline, paymentAttempts: [attempt] }];
  } } });
  const result = await service.listMyBookings("customer-a");
  assert.deepEqual(query.where, { customerId: "customer-a" });
  assert.deepEqual(query.select.paymentAttempts.select, {
    id: true, attemptNumber: true, status: true, expiresAt: true, createdAt: true,
    provider: true, verificationMode: true, amount: true, currency: true,
    refund: { select: { id: true, status: true, provider: true, verificationMode: true, amount: true, currency: true, attemptCount: true, succeededAt: true } },
  });
  assert.equal(result.items[0].paymentExpiresAt, deadline);
  assert.deepEqual(result.items[0].paymentAttempts, [attempt]);
  assert.equal(JSON.stringify(result).includes("providerReference"), false);
  assert.equal(JSON.stringify(result).includes("idempotencyKey"), false);
});

test("My Events exposes server-calculated cancellation eligibility using the configured window and persisted deadlines", async () => {
  const at = new Date("2026-11-10T12:00:00.000Z");
  const service = createCustomerEventsService({
    experienceBooking: { findMany: async () => [
      { ...records[0], status: "PENDING", holdExpiresAt: new Date(at.getTime() + 60_000), paymentAttempts: [], slot: { id: "slot-1", status: "OPEN", startsAt: new Date("2026-11-20T12:00:00.000Z") } },
      { ...records[0], id: "accepted", status: "ACCEPTED", holdExpiresAt: null, paymentExpiresAt: new Date(at.getTime() - 1), paymentAttempts: [], slot: { id: "slot-1", status: "OPEN", startsAt: new Date("2026-11-20T12:00:00.000Z") } },
      {
        ...records[0], id: "confirmed", status: "CONFIRMED", holdExpiresAt: null, totalAmountSnapshot: "800.00",
        paymentAttempts: [{ status: "SUCCEEDED", provider: "SIMULATED", verificationMode: "SIMULATED", amount: "800.00", currency: "INR" }],
        slot: { id: "slot-1", status: "OPEN", startsAt: new Date("2026-11-12T12:00:00.000Z") },
      },
      { ...records[0], id: "terminal", status: "COMPLETED", paymentAttempts: [], slot: { id: "slot-1", status: "OPEN", startsAt: new Date("2026-11-12T12:00:00.000Z") } },
    ] },
    platformSettings: { findUnique: async ({ where }) => {
      assert.deepEqual(where, { id: "default" });
      return { experienceCancellationWindowHours: 48 };
    } },
  }, { now: () => at });

  const result = await service.listMyBookings("customer-a");
  assert.equal(result.serverTime, at);
  assert.deepEqual(result.items.map(({ status, cancellation }) => ({ status, eligible: cancellation.eligible })), [
    { status: "PENDING", eligible: true },
    { status: "ACCEPTED", eligible: false },
    { status: "CONFIRMED", eligible: true },
    { status: "COMPLETED", eligible: false },
  ]);
  assert.equal(result.items[2].cancellation.deadlineAt.toISOString(), "2026-11-10T12:00:00.000Z");
});

test("My Events explains when a confirmed booking is inside the configured cancellation cutoff", async () => {
  const at = new Date("2026-10-18T12:00:00.000Z");
  const service = createCustomerEventsService({
    experienceBooking: { findMany: async () => [{
      ...records[0],
      status: "CONFIRMED",
      totalAmountSnapshot: "800.00",
      paymentAttempts: [{ status: "SUCCEEDED", provider: "SIMULATED", verificationMode: "SIMULATED", amount: "800.00", currency: "INR" }],
      slot: { id: "slot-1", status: "OPEN", startsAt: new Date("2026-10-19T12:00:00.000Z") },
    }] },
    platformSettings: { findUnique: async () => ({ experienceCancellationWindowHours: 48 }) },
  }, { now: () => at });

  const [booking] = (await service.listMyBookings("customer-a")).items;
  assert.equal(booking.cancellation.eligible, false);
  assert.equal(booking.cancellation.deadlineAt.toISOString(), "2026-10-17T12:00:00.000Z");
  assert.match(booking.cancellation.reason, /at least 48 hours before the experience starts/i);
});

test("My Events exposes a persisted simulated refund and clearly states that no real money was returned", async () => {
  const refund = {
    id: "refund-1", status: "SUCCEEDED", provider: "SIMULATED", verificationMode: "SIMULATED",
    amount: "800.00", currency: "INR", attemptCount: 1, succeededAt: new Date("2026-11-10T12:00:00.000Z"),
  };
  const service = createCustomerEventsService({
    experienceBooking: { findMany: async () => [{
      ...records[0], status: "CANCELLED", cancellationStatus: "APPROVED",
      paymentAttempts: [{ status: "SUCCEEDED", refund }],
    }] },
    platformSettings: { findUnique: async () => ({ experienceCancellationWindowHours: 48 }) },
  });
  const result = await service.listMyBookings("customer-a");
  assert.deepEqual(result.items[0].refund, {
    id: "refund-1", status: "SUCCEEDED", provider: "SIMULATED", verificationMode: "SIMULATED",
    amount: 800, currency: "INR", attemptCount: 1, succeededAt: refund.succeededAt,
    simulated: true, realMoneyReturned: false,
  });
});

test("My Events uses the persisted slot start and exact configured cutoff boundary, failing closed without slot time", async () => {
  const deadlineAt = new Date("2026-11-10T12:00:00.000Z");
  const eventStart = new Date("2026-11-12T12:00:00.000Z");
  const makeBooking = (overrides = {}) => ({
    ...records[0],
    id: "confirmed-test",
    status: "CONFIRMED",
    holdExpiresAt: null,
    totalAmount: 800,
    totalAmountSnapshot: null,
    paymentAttempts: [{ status: "SUCCEEDED", provider: "SIMULATED", verificationMode: "SIMULATED", amount: "800.00", currency: "INR" }],
    slot: { id: "slot-1", status: "OPEN", startsAt: eventStart },
    ...overrides,
  });

  // Exactly at the 48-hour boundary (now === deadlineAt)
  const atBoundaryService = createCustomerEventsService({
    experienceBooking: { findMany: async () => [makeBooking()] },
    platformSettings: { findUnique: async () => ({ experienceCancellationWindowHours: 48 }) },
  }, { now: () => deadlineAt });
  const atBoundaryResult = await atBoundaryService.listMyBookings("customer-a");
  assert.equal(atBoundaryResult.items[0].cancellation.eligible, true);
  assert.equal(atBoundaryResult.items[0].cancellation.deadlineAt.getTime(), deadlineAt.getTime());

  // 1ms past the 48-hour boundary (now > deadlineAt)
  const pastBoundaryService = createCustomerEventsService({
    experienceBooking: { findMany: async () => [makeBooking()] },
    platformSettings: { findUnique: async () => ({ experienceCancellationWindowHours: 48 }) },
  }, { now: () => new Date(deadlineAt.getTime() + 1) });
  const pastBoundaryResult = await pastBoundaryService.listMyBookings("customer-a");
  assert.equal(pastBoundaryResult.items[0].cancellation.eligible, false);

  // bookingDate cannot replace the authoritative slot start when it is missing.
  const bookingDateFallbackService = createCustomerEventsService({
    experienceBooking: { findMany: async () => [makeBooking({
      bookingDate: eventStart,
      slot: { id: "slot-1", status: "OPEN", startsAt: null },
    })] },
    platformSettings: { findUnique: async () => ({ experienceCancellationWindowHours: 48 }) },
  }, { now: () => new Date(deadlineAt.getTime() - 60_000) });
  const fallbackResult = await bookingDateFallbackService.listMyBookings("customer-a");
  assert.equal(fallbackResult.items[0].cancellation.eligible, false);
  assert.equal(fallbackResult.items[0].cancellation.deadlineAt, null);
  assert.match(fallbackResult.items[0].cancellation.reason, /could not be verified/i);
});


test("My Events endpoint requires authenticated Customer portal context", async () => {
  const routes = await readFile(new URL("../modules/events/customer-events.routes.js", import.meta.url), "utf8");
  const controller = await readFile(new URL("../modules/events/customer-events.controller.js", import.meta.url), "utf8");
  assert.match(routes, /router\.use\(authenticate, requireCustomerOrderAccess\)/);
  assert.match(routes, /router\.get\("\/my-bookings", listMyEventBookings\)/);
  assert.match(routes, /router\.get\("\/my-bookings\/dine", listMyDineBookings\)/);
  assert.match(routes, /router\.get\("\/my-bookings\/workshops", listMyWorkshopBookings\)/);
  assert.match(controller, /service\.listMyBookings\(req\.user\.id\)/);
  assert.doesNotMatch(controller, /req\.query\.customerId|req\.body\.customerId/);

  let customerError;
  requireCustomerOrderAccess({ user: { status: "ACTIVE", activePortal: "CUSTOMER" } }, {}, (error) => { customerError = error; });
  assert.equal(customerError, undefined);
  let deliveryError;
  requireCustomerOrderAccess({ user: { status: "ACTIVE", activePortal: "DELIVERY_AGENT" } }, {}, (error) => { deliveryError = error; });
  assert.equal(deliveryError.statusCode, 403);
});
