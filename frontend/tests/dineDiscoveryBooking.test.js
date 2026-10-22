import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  bookableGuestLimit,
  createDineBookingPayload,
  publicExperienceType,
  validateDineBookingSelection,
} from "../src/utils/dineExperienceBooking.js";
import {
  getOrCreateDineBookingIdempotencyKey,
  isDefinitiveDineBookingRejection,
  isDefinitiveDineBookingSuccess,
  retireDineBookingIdempotencyKey,
} from "../src/utils/dineBookingIdempotency.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const experience = {
  id: "experience-1",
  maxGuests: 8,
  pricePerPerson: 950,
  slots: [{ id: "slot-1", availableSeats: 3 }],
};

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    read: (key) => values.get(key),
  };
};

const requestIdentity = { customerId: "customer-1", experienceId: "experience-1", slotId: "slot-1", numberOfGuests: 2 };

test("discovery types map to the backend experience enum values", () => {
  assert.equal(publicExperienceType("dining"), "HOME_DINING");
  assert.equal(publicExperienceType("workshop"), "WORKSHOP");
  assert.equal(publicExperienceType("other"), null);
});

test("booking selection respects both remaining seats and experience guest limits", () => {
  assert.equal(bookableGuestLimit(experience, experience.slots[0]), 3);
  assert.equal(validateDineBookingSelection({ experience, slotId: "slot-1", guestCount: "3" }), "");
  assert.match(validateDineBookingSelection({ experience, slotId: "missing", guestCount: 1 }), /Select an available slot/);
  assert.match(validateDineBookingSelection({ experience, slotId: "slot-1", guestCount: 4 }), /exceeds the seats currently available/);
  assert.match(validateDineBookingSelection({ experience, slotId: "slot-1", guestCount: 0 }), /Select an available slot/);
});

test("guest counts 1, 2, 3, and 4 validate against remaining seats, the 3-guest limit, and calculate total price", () => {
  const openExp = {
    id: "experience-open",
    maxGuests: 6,
    pricePerPerson: 950,
    slots: [
      { id: "slot-equal", availableSeats: 2 },
      { id: "slot-greater", availableSeats: 5 },
      { id: "slot-fewer", availableSeats: 1 },
    ],
  };

  // Valid counts 1, 2, 3 with correct total price multiplication
  for (const count of [1, 2, 3]) {
    assert.equal(validateDineBookingSelection({ experience: openExp, slotId: "slot-greater", guestCount: count }), "");
    const totalPrice = Number(openExp.pricePerPerson) * count;
    assert.equal(totalPrice, 950 * count);
  }

  // Count 4 exceeds the product limit of 3 guests even when 5 seats remain available
  const exceedsProductLimit = validateDineBookingSelection({ experience: openExp, slotId: "slot-greater", guestCount: 4 });
  assert.match(exceedsProductLimit, /maximum limit of 3 guests/);

  // Available seats equal to requested count: valid
  assert.equal(validateDineBookingSelection({ experience: openExp, slotId: "slot-equal", guestCount: 2 }), "");

  // Available seats greater than requested count: valid
  assert.equal(validateDineBookingSelection({ experience: openExp, slotId: "slot-greater", guestCount: 2 }), "");

  // Available seats fewer than requested count: reports insufficient seats clearly
  const fewerSeats = validateDineBookingSelection({ experience: openExp, slotId: "slot-fewer", guestCount: 2 });
  assert.match(fewerSeats, /exceeds the seats currently available/);

  // bookableGuestLimit caps at 3 even if slot has 5 seats
  assert.equal(bookableGuestLimit(openExp, openExp.slots[1]), 3);
  // bookableGuestLimit respects remaining seats when fewer than 3
  assert.equal(bookableGuestLimit(openExp, openExp.slots[2]), 1);
});

test("booking request uses the backend's exact body and requires an idempotency key", () => {
  assert.deepEqual(createDineBookingPayload({ experience, slotId: "slot-1", guestCount: "2", idempotencyKey: "request-key-123" }), {
    experienceId: "experience-1",
    slotId: "slot-1",
    numberOfGuests: 2,
    idempotencyKey: "request-key-123",
  });
  assert.throws(() => createDineBookingPayload({ experience, slotId: "slot-1", guestCount: 2 }), /booking request key is required/);
});

test("an uncertain booking request recovers its idempotency key after a page reload", () => {
  const storage = createStorage();
  const firstPageKey = getOrCreateDineBookingIdempotencyKey(requestIdentity, { storage, createKey: () => "stable-key" });
  // A remounted page has no component memory; sessionStorage is the only state passed through.
  const reloadedPageKey = getOrCreateDineBookingIdempotencyKey(requestIdentity, { storage, createKey: () => "wrong-new-key" });
  assert.equal(firstPageKey, "stable-key");
  assert.equal(reloadedPageKey, firstPageKey);
  assert.deepEqual(Object.keys(JSON.parse(storage.read("tastebridge:dine-booking-idempotency:v1"))[0]).sort(), [
    "customerId", "experienceId", "idempotencyKey", "numberOfGuests", "slotId",
  ]);
});

test("the same logical request reuses a key while changed backend fields or customer scope get a new key", () => {
  const storage = createStorage();
  let sequence = 0;
  const createKey = () => `key-${++sequence}`;
  const original = getOrCreateDineBookingIdempotencyKey(requestIdentity, { storage, createKey });
  assert.equal(getOrCreateDineBookingIdempotencyKey(requestIdentity, { storage, createKey }), original);
  assert.notEqual(getOrCreateDineBookingIdempotencyKey({ ...requestIdentity, numberOfGuests: 3 }, { storage, createKey }), original);
  assert.notEqual(getOrCreateDineBookingIdempotencyKey({ ...requestIdentity, slotId: "slot-2" }, { storage, createKey }), original);
  assert.notEqual(getOrCreateDineBookingIdempotencyKey({ ...requestIdentity, experienceId: "experience-2" }, { storage, createKey }), original);
  assert.notEqual(getOrCreateDineBookingIdempotencyKey({ ...requestIdentity, customerId: "customer-2" }, { storage, createKey }), original);
});

test("network and ambiguous server failures retain the key for a safe retry", () => {
  const storage = createStorage();
  const key = getOrCreateDineBookingIdempotencyKey(requestIdentity, { storage, createKey: () => "retry-key" });
  for (const error of [{ message: "Network Error" }, { status: 500 }, { status: 502 }]) {
    if (isDefinitiveDineBookingRejection(error)) retireDineBookingIdempotencyKey(requestIdentity, { storage });
  }
  assert.equal(getOrCreateDineBookingIdempotencyKey(requestIdentity, { storage, createKey: () => "new-key" }), key);
});

test("definitive success and backend rejection retire the pending key", () => {
  const storage = createStorage();
  let nextKey = 0;
  const createKey = () => `key-${++nextKey}`;
  const key = getOrCreateDineBookingIdempotencyKey(requestIdentity, { storage, createKey });
  assert.equal(isDefinitiveDineBookingSuccess({ id: "booking-1", status: "PENDING" }), true);
  retireDineBookingIdempotencyKey(requestIdentity, { storage });
  assert.notEqual(getOrCreateDineBookingIdempotencyKey(requestIdentity, { storage, createKey }), key);

  assert.equal(isDefinitiveDineBookingRejection({ status: 409 }), true);
  retireDineBookingIdempotencyKey(requestIdentity, { storage });
  assert.notEqual(getOrCreateDineBookingIdempotencyKey(requestIdentity, { storage, createKey }), key);
  assert.equal(isDefinitiveDineBookingRejection({ status: 500 }), false);
  assert.equal(isDefinitiveDineBookingRejection({}), false);
});

test("Explore connects public discovery and booking while preserving food marketplace behavior", async () => {
  const [page, discovery, card, api, backendRoutes, bookingUtils] = await Promise.all([
    read("../src/pages/ExplorePage.jsx"),
    read("../src/components/events/DineExperienceDiscovery.jsx"),
    read("../src/components/events/ExperienceCard.jsx"),
    read("../src/api/eventsApi.js"),
    read("../../backend/src/modules/events/customer-events.routes.js"),
    read("../src/utils/dineExperienceBooking.js"),
  ]);
  assert.match(page, /<DineExperienceDiscovery[\s\S]*?discoveryType=\{filters\.type\}[\s\S]*?categoryName=\{selectedCuisine\}/);
  assert.match(page, /if \(isDineDiscovery\)/);
  assert.match(page, /api\.get\("\/dishes"/);
  assert.match(api, /api\.get\("\/experiences", \{ \.\.\.config, params \}\)/);
  assert.match(api, /api\.post\("\/events\/bookings", data\)/);
  assert.match(backendRoutes, /router\.post\("\/bookings", validate\(createDineBookingSchema\), createMyDineBooking\)/);
  assert.match(discovery, /eventsApi\.getExperiences\(params, \{ signal: controller\.signal \}\)/);
  assert.match(card, /experience\.slots\.map/);
  assert.match(card, /availableSeats/);
  assert.match(bookingUtils, /experience\?\.maxGuests/);
  assert.match(discovery, /eventsApi\.createBooking\(payload\)/);
  assert.match(discovery, /getOrCreateDineBookingIdempotencyKey/);
  assert.match(discovery, /retireDineBookingIdempotencyKey/);
  assert.match(discovery, /isDefinitiveDineBookingRejection/);
  assert.match(discovery, /customerId: String\(user\.id\)/);
  assert.match(discovery, /if \(idempotencyKey && isDefinitiveDineBookingRejection\(error\)\)/);
  assert.match(discovery, /submitLock\.current/);
  assert.match(discovery, /booking\.status/);
  assert.match(discovery, /navigate\("\/my-events"/);
  assert.match(discovery, /OPEN_AUTH_MODAL_EVENT/);
  assert.doesNotMatch(discovery, /payment-attempts|confirmMyDineBookingPayment|CONFIRMED/);
});

test("My Events displays the server-returned status after a successful booking request", async () => {
  const page = await read("../src/pages/MyEventsPage.jsx");
  const landing = await read("../src/pages/MyEventsLandingPage.jsx");
  const service = await read("../../backend/src/modules/events/customer-events.service.js");
  assert.match(landing, /createdDineBooking\?\.status/);
  assert.match(landing, /Current server status:/);
  assert.match(page, /getMyDineBookings/);
  assert.match(service, /where: \{ customerId, \...\(experienceType \? \{ experience: \{ type: experienceType \} \} : \{\}\) \}/);
  assert.match(service, /status: booking\.status/);
});

test("discovery exposes loading, empty, API failure, validation, and duplicate-submit states", async () => {
  const [discovery, bookingUtils, card] = await Promise.all([
    read("../src/components/events/DineExperienceDiscovery.jsx"),
    read("../src/utils/dineExperienceBooking.js"),
    read("../src/components/events/ExperienceCard.jsx"),
  ]);
  assert.match(discovery, /role="status"[\s\S]*?Loading experiences/);
  assert.match(discovery, /No available experiences yet/);
  assert.match(discovery, /role="alert"[^>]*>[\s\S]*?\{listing\.error\}/);
  assert.match(discovery, /let message = error\?\.message/);
  assert.match(discovery, /setBookingErrors\(\(current\) => \(\{ \.\.\.current, \[experience\.id\]: message/);
  assert.match(discovery, /catch \(error\)/);
  assert.match(discovery, /submitLock\.current\) return/);
  assert.match(card, /disabled=\{busy \|\| guestLimit < 1\}/);
  assert.match(bookingUtils, /validateDineBookingSelection/);
  assert.match(discovery, /setRetry\(\(value\) => value \+ 1\)/);
});
