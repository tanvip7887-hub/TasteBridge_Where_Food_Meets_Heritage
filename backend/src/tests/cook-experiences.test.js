import test from "node:test";
import assert from "node:assert/strict";
import { createCookExperiencesService } from "../modules/cook/cook-experiences.service.js";
import {
  createExperienceDraftSchema, publishExperienceSchema, updateExperienceDraftSchema, createExperienceSlotSchema, updateExperienceSlotSchema,
} from "../modules/cook/experience.validation.js";
import { requireApprovedCook } from "../middlewares/auth.js";
import { updatePlatformSettingsSchema } from "../modules/admin/admin.validation.js";
import { createCustomerEventsService } from "../modules/events/customer-events.service.js";

const now = new Date("2026-10-17T12:00:00.000Z");
const workshopImage = { buffer: Buffer.from("verified-image-fixture"), originalname: "workshop.png", mimetype: "image/png" };
const storageFixture = () => {
  let next = 0;
  return {
    uploadPublicMarketplaceImage: async () => ({ publicId: `workshop-${++next}`, secureUrl: `https://images.example/workshop-${next}.jpg` }),
    deleteCloudinaryAsset: async () => ({ result: "ok" }),
  };
};
const readyCook = {
  id: "cook-1", user: { id: "user-1", role: "COOK", status: "ACTIVE" },
  profileImage: "https://images.example/cook-profile.jpg",
  verificationStatus: "APPROVED", isApprovedToSell: true,
  fssaiStatus: "APPROVED", fssaiExpiryDate: new Date("2027-01-01T00:00:00Z"),
  isHomeKitchenDeclared: true, foodSafetyConsent: true,
  businessName: "Test Kitchen", bio: "A sufficiently long cooking introduction.", experienceYears: "5",
  specialization: "Home dining", city: "Pune", locality: "Kothrud", cookingCapacity: "20 guests", prepTimeNotice: "24 hours",
  cuisines: ["Maharashtrian"], dietaryPreferences: ["Vegetarian"], availableDays: ["Saturday"], availableMealSlots: ["Dinner"],
};

const fixture = ({ experiences = [], slots = [], bookings = [], cooks = [readyCook], dishes = [] } = {}) => {
  const state = { experiences: structuredClone(experiences), slots: structuredClone(slots), bookings: structuredClone(bookings), menuItems: [], cooks, dishes, notifications: [] };
  let nextId = 1;
  const db = {};
  db.$queryRaw = async (strings, ...values) => {
    const sql = strings.join("?");
    if (sql.includes('UPDATE "ExperienceSlot"')) {
      const [seats, slotId] = values;
      const slot = state.slots.find((item) => item.id === slotId);
      if (!slot || slot.status !== "OPEN" || slot.availableSeats + seats > slot.capacity) return [];
      slot.availableSeats += seats;
      return [{ id: slotId }];
    }
    if (sql.includes('FROM "ExperienceBooking"')) {
      const [scopeId, at] = values;
      return state.bookings.filter((booking) => booking.status === "PENDING" && booking.slotId
        && booking.holdExpiresAt instanceof Date && booking.holdExpiresAt <= (at || scopeId)
        && (sql.includes('"slotId" =') ? booking.slotId === scopeId : !sql.includes('"experienceId" =') || booking.experienceId === scopeId))
        .sort((left, right) => left.slotId.localeCompare(right.slotId) || left.id.localeCompare(right.id));
    }
    const experienceId = values[0];
    const cookId = values[1];
    return state.experiences.some((item) => item.id === experienceId && item.cookId === cookId) ? [{ id: experienceId }] : [];
  };
  db.experience = {
    findMany: async ({ where }) => state.experiences.filter((row) => row.cookId === where.cookId).map((row) => ({ ...row, menuItems: [], slots: [] })),
    findFirst: async ({ where, include }) => {
      const row = state.experiences.find((item) => item.id === where.id && item.cookId === where.cookId);
      if (!row) return null;
      return { ...row, ...(include ? { menuItems: state.menuItems.filter((item) => item.experienceId === row.id), slots: state.slots.filter((item) => item.experienceId === row.id) } : {}) };
    },
    findUnique: async ({ where, include }) => {
      const compound = where.cookId_publishIdempotencyKey;
      const row = state.experiences.find((item) => item.cookId === compound?.cookId
        && item.publishIdempotencyKey === compound?.publishIdempotencyKey);
      return row ? { ...row, ...(include ? { menuItems: state.menuItems.filter((item) => item.experienceId === row.id), slots: state.slots.filter((item) => item.experienceId === row.id) } : {}) } : null;
    },
    create: async ({ data }) => {
      const { menuItems, ...fields } = data;
      if (fields.publishIdempotencyKey && state.experiences.some((item) => item.cookId === fields.cookId && item.publishIdempotencyKey === fields.publishIdempotencyKey)) {
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }
      const row = { id: `experience-${nextId++}`, type: "HOME_DINING", description: null, cuisine: null, pricePerPerson: null, location: null, maxGuests: 6, durationMinutes: 120, photos: [], ...fields };
      state.experiences.push(row);
      if (menuItems?.create) state.menuItems.push(...menuItems.create.map((item) => ({ experienceId: row.id, ...item })));
      return { ...row, menuItems: state.menuItems.filter((item) => item.experienceId === row.id), slots: [] };
    },
    update: async ({ where, data, include, select }) => {
      const row = state.experiences.find((item) => item.id === where.id);
      const normalized = { ...data };
      if (!Array.isArray(normalized.photos) && normalized.photos?.push) normalized.photos = [...row.photos, normalized.photos.push];
      Object.assign(row, normalized);
      return select ? { id: row.id, image: row.image, photos: row.photos } : { ...row, ...(include ? { menuItems: state.menuItems.filter((item) => item.experienceId === row.id), slots: state.slots.filter((item) => item.experienceId === row.id) } : {}) };
    },
  };
  db.experienceSlot = {
    findMany: async ({ where }) => state.slots.filter((slot) => slot.experienceId === where.experienceId),
    findFirst: async ({ where }) => {
      const slot = state.slots.find((item) => (where.id === undefined || item.id === where.id)
        && (where.experienceId === undefined || item.experienceId === where.experienceId)
        && (!where.status || item.status === where.status)
        && (!where.startsAt?.gt || item.startsAt > where.startsAt.gt)
        && (!where.availableSeats?.gt || item.availableSeats > where.availableSeats.gt));
      if (!slot) return null;
      if (where.experience?.cookId && !state.experiences.some((item) => item.id === slot.experienceId && item.cookId === where.experience.cookId)) return null;
      return slot;
    },
    create: async ({ data }) => { const slot = { id: `slot-${nextId++}`, status: "OPEN", ...data }; state.slots.push(slot); return slot; },
    update: async ({ where, data }) => { const slot = state.slots.find((item) => item.id === where.id); Object.assign(slot, data); return slot; },
    findUnique: async ({ where }) => state.slots.find((item) => item.id === where.id) || null,
    updateMany: async ({ where, data }) => {
      const slot = state.slots.find((item) => item.id === where.id);
      if (!slot || Object.entries(where).some(([key, expected]) => key !== "id" && slot[key] !== expected)) return { count: 0 };
      if (data.availableSeats?.increment) slot.availableSeats += data.availableSeats.increment;
      else Object.assign(slot, data);
      return { count: 1 };
    },
  };
  db.experienceBooking = {
    updateMany: async ({ where, data }) => {
      const booking = state.bookings.find((item) => item.id === where.id && item.status === where.status && item.holdExpiresAt <= where.holdExpiresAt.lte);
      if (!booking) return { count: 0 };
      Object.assign(booking, data);
      return { count: 1 };
    },
    count: async ({ where }) => state.bookings.filter((booking) => (!where.experienceId || booking.experienceId === where.experienceId) && (!where.slotId || booking.slotId === where.slotId) && (!where.status?.in || where.status.in.includes(booking.status))).length,
    aggregate: async ({ where }) => {
      const bookings = state.bookings.filter((booking) => (!where.experienceId || booking.experienceId === where.experienceId)
        && (!where.slotId || booking.slotId === where.slotId)
        && (!where.status?.in || where.status.in.includes(booking.status)));
      return {
        _sum: { numberOfGuests: bookings.reduce((sum, booking) => sum + booking.numberOfGuests, 0) || null },
        _max: { numberOfGuests: bookings.length ? Math.max(...bookings.map((booking) => booking.numberOfGuests)) : null },
      };
    },
  };
  db.experienceMenuItem = {
    deleteMany: async ({ where }) => { state.menuItems = state.menuItems.filter((item) => item.experienceId !== where.experienceId); },
    createMany: async ({ data }) => { state.menuItems.push(...data); return { count: data.length }; },
  };
  db.dish = { findMany: async ({ where }) => state.dishes.filter((dish) => where.id.in.includes(dish.id) && dish.cookId === where.cookId).map(({ id }) => ({ id })) };
  db.cookProfile = { findUnique: async ({ where }) => state.cooks.find((cook) => cook.id === where.id) || null };
  db.platformSettings = { findUnique: async () => null };
  db.userNotification = {
    upsert: async ({ where, create }) => {
      const existing = state.notifications.find((item) => item.userId === where.userId_portal_eventKey.userId
        && item.portal === where.userId_portal_eventKey.portal && item.eventKey === where.userId_portal_eventKey.eventKey);
      if (existing) return existing;
      state.notifications.push(create);
      return create;
    },
  };
  db.$transaction = async (callback) => callback(db);
  return { db, state };
};

const baseExperience = (overrides = {}) => ({
  id: "exp-1", cookId: "cook-1", type: "HOME_DINING", title: "Sunday table", theme: "Family recipes",
  description: "A long-form description for the home dining event.", cuisine: "Maharashtrian", pricePerPerson: 900,
  maxGuests: 8, durationMinutes: 180, publicArea: "Kothrud, Pune", privateAddress: "12 Example Road, Pune", addressSource: "CUSTOM",
  location: "Kothrud, Pune", image: "photo-url", photos: ["photo-url"], menuNotes: "Seasonal menu", status: "DRAFT",
  ...overrides,
});

test("Cook can create and edit only owned experience drafts and links only their own dishes", async () => {
  const { db, state } = fixture({ dishes: [{ id: "dish-1", cookId: "cook-1" }, { id: "dish-2", cookId: "cook-2" }] });
  const service = createCookExperiencesService(db, { now: () => now });
  const created = await service.createDraft("cook-1", { title: "Sunday table", menuDishIds: ["dish-1"] });
  assert.equal(created.status, "DRAFT");
  assert.equal(created.type, "HOME_DINING");
  assert.equal(state.menuItems[0].dishId, "dish-1");
  await assert.rejects(service.createDraft("cook-1", { title: "Other dish", menuDishIds: ["dish-2"] }), { statusCode: 400 });
  const edited = await service.updateDraft("cook-1", created.id, { theme: "Updated theme" });
  assert.equal(edited.theme, "Updated theme");
  await assert.rejects(service.updateDraft("cook-1", created.id, { type: "WORKSHOP" }), /type cannot be changed/);
  await assert.rejects(service.updateDraft("cook-2", created.id, { title: "Takeover" }), { statusCode: 404 });
});

test("list and status operations remain scoped to the authenticated Cook", async () => {
  const { db } = fixture({ experiences: [baseExperience()] });
  const service = createCookExperiencesService(db, { now: () => now });
  assert.equal((await service.list("cook-2")).items.length, 0);
  await assert.rejects(service.publish("cook-2", "exp-1"), { statusCode: 404 });
  await assert.rejects(service.pause("cook-2", "exp-1"), { statusCode: 404 });
});

test("active experience bookings prevent price, venue, and menu edits", async () => {
  const { db } = fixture({
    experiences: [baseExperience()],
    bookings: [{ id: "booking-1", experienceId: "exp-1", status: "CONFIRMED", numberOfGuests: 2 }],
  });
  const service = createCookExperiencesService(db, { now: () => now });
  await assert.rejects(service.updateDraft("cook-1", "exp-1", { pricePerPerson: 1000 }), /cannot be changed while active bookings exist/);
  await assert.rejects(service.updateDraft("cook-1", "exp-1", { publicArea: "Different neighborhood" }), /cannot be changed while active bookings exist/);
  await assert.rejects(service.updateDraft("cook-1", "exp-1", { menuNotes: "Different menu" }), /cannot be changed while active bookings exist/);
});

test("maxGuests cannot be reduced below an active booking, but safe reductions and increases remain allowed", async () => {
  for (const status of ["PENDING", "ACCEPTED", "CONFIRMED"]) {
    const { db, state } = fixture({
      experiences: [baseExperience()],
      bookings: [{ id: "booking-1", experienceId: "exp-1", status, numberOfGuests: 4 }],
    });
    const service = createCookExperiencesService(db, { now: () => now });

    await assert.rejects(
      service.updateDraft("cook-1", "exp-1", { maxGuests: 3 }),
      /cannot be reduced below an active booking's guest count/,
    );
    assert.equal(state.experiences[0].maxGuests, 8);
    assert.equal((await service.updateDraft("cook-1", "exp-1", { maxGuests: 4 })).maxGuests, 4);
    assert.equal((await service.updateDraft("cook-1", "exp-1", { maxGuests: 10 })).maxGuests, 10);
  }
});

test("expired holds are released before maxGuests edits and are not counted as active", async () => {
  const { db, state } = fixture({
    experiences: [baseExperience()],
    slots: [{ id: "slot-1", experienceId: "exp-1", startsAt: new Date("2026-10-20T12:00:00Z"), endsAt: new Date("2026-10-20T14:00:00Z"), capacity: 5, availableSeats: 3, status: "OPEN" }],
    bookings: [{ id: "booking-1", experienceId: "exp-1", customerId: "customer-1", slotId: "slot-1", status: "PENDING", numberOfGuests: 2, holdExpiresAt: new Date(now.getTime() - 1) }],
  });
  const service = createCookExperiencesService(db, { now: () => now });
  const updated = await service.updateDraft("cook-1", "exp-1", { maxGuests: 1 });
  assert.equal(updated.maxGuests, 1);
  assert.equal(state.bookings[0].status, "EXPIRED");
  assert.equal(state.slots[0].availableSeats, 5);
});

test("expired holds are removed from slot capacity accounting before a Cook reduces capacity", async () => {
  const { db, state } = fixture({
    experiences: [baseExperience()],
    slots: [{ id: "slot-1", experienceId: "exp-1", startsAt: new Date("2026-10-20T12:00:00Z"), endsAt: new Date("2026-10-20T14:00:00Z"), capacity: 5, availableSeats: 3, status: "OPEN" }],
    bookings: [{ id: "booking-1", experienceId: "exp-1", customerId: "customer-1", slotId: "slot-1", status: "PENDING", numberOfGuests: 2, holdExpiresAt: new Date(now.getTime() - 1) }],
  });
  const slot = await createCookExperiencesService(db, { now: () => now }).updateSlot("cook-1", "exp-1", "slot-1", { capacity: 1 });
  assert.equal(state.bookings[0].status, "EXPIRED");
  assert.equal(slot.capacity, 1);
  assert.equal(slot.availableSeats, 1);
  assert.equal(slot.availableSeats, slot.capacity); // Expired guests no longer count as held.
});

test("existing approved-Cook middleware rejects wrong-role and unapproved sessions", () => {
  const invoke = (user) => {
    let error = null;
    let continued = false;
    requireApprovedCook({ user }, {}, (nextError) => { error = nextError || null; continued = !nextError; });
    return { error, continued };
  };
  assert.equal(invoke({ status: "ACTIVE", role: "CUSTOMER", activePortal: "CUSTOMER" }).error.statusCode, 403);
  assert.equal(invoke({ status: "ACTIVE", role: "COOK", activePortal: "COOK", cookProfile: { verificationStatus: "PENDING" } }).error.statusCode, 403);
  assert.equal(invoke({ status: "ACTIVE", role: "COOK", activePortal: "COOK", cookProfile: { verificationStatus: "APPROVED" } }).continued, true);
});

test("publishing requires complete details, uploaded photo, future open slot, and cook readiness", async () => {
  const incomplete = fixture({ experiences: [baseExperience({ theme: null, photos: [], image: null, menuNotes: null })] });
  const service = createCookExperiencesService(incomplete.db, { now: () => now });
  await assert.rejects(service.publish("cook-1", "exp-1"), /Complete required experience details/);

  const noSlot = fixture({ experiences: [baseExperience()] });
  await assert.rejects(createCookExperiencesService(noSlot.db, { now: () => now }).publish("cook-1", "exp-1"), /future open slot/);

  const notReady = fixture({ experiences: [baseExperience()], slots: [{ id: "slot-1", experienceId: "exp-1", startsAt: new Date("2026-10-20T12:00:00Z"), endsAt: new Date("2026-10-20T14:00:00Z"), capacity: 6, availableSeats: 6, status: "OPEN" }], cooks: [{ ...readyCook, isApprovedToSell: false }] });
  await assert.rejects(createCookExperiencesService(notReady.db, { now: () => now }).publish("cook-1", "exp-1"), /not ready to publish/);
});

test("ready Cook publishes a complete experience only when a future open slot exists", async () => {
  const slot = { id: "slot-1", experienceId: "exp-1", startsAt: new Date("2026-10-20T12:00:00Z"), endsAt: new Date("2026-10-20T14:00:00Z"), capacity: 6, availableSeats: 6, status: "OPEN" };
  const { db, state } = fixture({ experiences: [baseExperience()], slots: [slot] });
  const published = await createCookExperiencesService(db, { now: () => now }).publish("cook-1", "exp-1");
  assert.equal(published.status, "PUBLISHED");
  assert.equal(state.experiences[0].status, "PUBLISHED");
});

test("published workshops must be paused and resubmitted before edited details return to customers", async () => {
  const slot = { id: "slot-1", experienceId: "exp-1", startsAt: new Date("2026-10-25T12:00:00Z"), endsAt: new Date("2026-10-25T14:00:00Z"), capacity: 6, availableSeats: 6, status: "OPEN" };
  const { db, state } = fixture({ experiences: [baseExperience({ type: "WORKSHOP", status: "PUBLISHED", teachingContent: "Teach regional techniques.", learningOutcomes: "Learn the regional cooking method." })], slots: [slot] });
  const service = createCookExperiencesService(db, { now: () => now });
  await assert.rejects(service.updateDraft("cook-1", "exp-1", { title: "Changed workshop" }), /Pause the workshop before editing/);
  await service.pause("cook-1", "exp-1");
  await service.updateDraft("cook-1", "exp-1", { title: "Changed workshop" });
  const resubmitted = await service.publish("cook-1", "exp-1");
  assert.equal(resubmitted.status, "PENDING");
  assert.equal(state.experiences[0].title, "Changed workshop");
});

test("direct publishing atomically creates a published experience and its IST-derived slot", async () => {
  const { db, state } = fixture();
  const service = createCookExperiencesService(db, { now: () => now });
  const published = await service.publishNew("cook-1", publishExperienceSchema.body.parse({
    idempotencyKey: "0da58d5f-442d-45ca-a789-23c58ae4dd57",
    type: "HOME_DINING",
    title: "Sunday table",
    theme: "Family recipes",
    description: "A long-form description for the home dining event.",
    cuisine: "Maharashtrian",
    isVegetarian: true,
    menuNotes: "Seasonal menu",
    pricePerPerson: 900,
    maxGuests: 3,
    capacity: 12,
    durationMinutes: 180,
    location: "12 Example Road, Kothrud, Pune",
    startsAt: "2026-10-25T18:00:00+05:30",
  }));

  assert.equal(published.status, "PUBLISHED");
  assert.equal(state.experiences.length, 1);
  assert.equal(state.experiences[0].type, "HOME_DINING");
  assert.equal(state.experiences[0].title, "Sunday table");
  assert.equal(state.experiences[0].theme, "Family recipes");
  assert.equal(state.experiences[0].cuisine, "Maharashtrian");
  assert.equal(state.experiences[0].isVegetarian, true);
  assert.equal(state.experiences[0].description, "A long-form description for the home dining event.");
  assert.equal(state.experiences[0].dietaryNotes, null);
  assert.equal(state.experiences[0].menuNotes, "Seasonal menu");
  assert.equal(state.experiences[0].pricePerPerson, 900);
  assert.equal(state.experiences[0].maxGuests, 3);
  assert.equal(state.experiences[0].durationMinutes, 180);
  assert.equal(state.experiences[0].publicArea, "Kothrud, Pune");
  assert.equal(state.experiences[0].privateAddress, "12 Example Road, Kothrud, Pune");
  assert.equal(state.experiences[0].photos[0], readyCook.profileImage);
  assert.equal(state.slots.length, 1);
  assert.equal(state.slots[0].startsAt.toISOString(), "2026-10-25T12:30:00.000Z");
  assert.equal(state.slots[0].endsAt.toISOString(), "2026-10-25T15:30:00.000Z");
  assert.equal(state.slots[0].capacity, 12);
  assert.equal(state.slots[0].availableSeats, 12);
  assert.equal(state.slots[0].status, "OPEN");
});

test("Cook workshop submission creates one pending workshop and an initial open slot", async () => {
  const { db, state } = fixture();
  const input = publishExperienceSchema.body.parse({
    idempotencyKey: "282dd51a-2fe4-4c2d-946e-96d531922604",
    type: "WORKSHOP", title: "Fresh pasta workshop", theme: "Handmade pasta",
    description: "Learn to make fresh pasta in a small home kitchen class.",
    teachingContent: "Mix, knead, roll and shape fresh pasta dough.", learningOutcomes: "Participants learn dough hydration and pasta shaping.", materialsToBring: "Apron",
    pricePerPerson: 1200,
    maxGuests: 3, capacity: 8, durationMinutes: 90,
    location: "12 Example Road, Kothrud, Pune", startsAt: "2026-10-25T18:00:00+05:30",
  });
  const submitted = await createCookExperiencesService(db, { now: () => now, storage: storageFixture() }).publishNew("cook-1", input, workshopImage);
  assert.equal(submitted.type, "WORKSHOP");
  assert.equal(submitted.status, "PENDING");
  assert.equal(state.experiences.length, 1);
  assert.equal(state.slots.length, 1);
  assert.equal(state.slots[0].status, "OPEN");
  assert.equal(state.slots[0].capacity, 8);
  assert.equal(state.experiences[0].teachingContent, input.teachingContent);
  assert.equal(state.experiences[0].learningOutcomes, input.learningOutcomes);
  assert.equal(state.experiences[0].materialsToBring, "Apron");
  assert.equal(state.experiences[0].image, "https://images.example/workshop-1.jpg");
  assert.equal(state.experiences[0].cuisine, null);
});

test("Workshop submission requires a genuine uploaded image and retries reuse the same stored record", async () => {
  const { db, state } = fixture();
  const storage = storageFixture();
  let uploads = 0;
  const trackedStorage = {
    ...storage,
    uploadPublicMarketplaceImage: async (args) => {
      uploads += 1;
      return storage.uploadPublicMarketplaceImage(args);
    },
  };
  const service = createCookExperiencesService(db, { now: () => now, storage: trackedStorage });
  const input = publishExperienceSchema.body.parse({
    idempotencyKey: "629a6b89-6df0-4cb6-a8dd-2492e1031f9a", type: "WORKSHOP",
    title: "Bread workshop", theme: "Sourdough", description: "Learn the basics of sourdough bread baking.",
    teachingContent: "Mix and shape a sourdough loaf.", learningOutcomes: "Learn fermentation and shaping basics.",
    pricePerPerson: 800, maxGuests: 3, capacity: 10, durationMinutes: 120,
    location: "12 Example Road, Kothrud, Pune", startsAt: "2026-10-25T18:00:00+05:30",
  });
  await assert.rejects(service.publishNew("cook-1", input), /Upload a workshop image/);
  const first = await service.publishNew("cook-1", input, workshopImage);
  const retry = await service.publishNew("cook-1", input, workshopImage);
  assert.equal(first.id, retry.id);
  assert.equal(state.experiences.length, 1);
  assert.equal(state.slots.length, 1);
  assert.equal(uploads, 1);
  await assert.rejects(service.publishNew("cook-1", input, { ...workshopImage, buffer: Buffer.from("different image") }), /different event details/);
  assert.equal(state.experiences.length, 1);
  assert.equal(uploads, 1);
});

test("workshop image replacement and removal stay owner-scoped and cannot change a published listing", async () => {
  const experience = baseExperience({ type: "WORKSHOP", status: "PENDING", teachingContent: "Teach cooking skills.", learningOutcomes: "Learn a cooking technique." });
  const { db, state } = fixture({ experiences: [experience] });
  const storage = storageFixture();
  let uploadCount = 0;
  const service = createCookExperiencesService(db, {
    now: () => now,
    storage: {
      ...storage,
      uploadPublicMarketplaceImage: async (...args) => {
        uploadCount += 1;
        return storage.uploadPublicMarketplaceImage(...args);
      },
    },
  });
  const replaced = await service.replaceWorkshopPhoto("cook-1", "exp-1", workshopImage);
  assert.equal(replaced.image, "https://images.example/workshop-1.jpg");
  assert.deepEqual(replaced.photos, [replaced.image]);
  await assert.rejects(service.replaceWorkshopPhoto("cook-2", "exp-1", workshopImage), { statusCode: 404 });
  assert.equal(uploadCount, 1, "an unauthorized Cook must not trigger an external image upload");
  await service.removeWorkshopPhoto("cook-1", "exp-1");
  assert.equal(state.experiences[0].image, null);
  assert.deepEqual(state.experiences[0].photos, []);

  state.experiences[0].status = "PUBLISHED";
  await assert.rejects(service.replaceWorkshopPhoto("cook-1", "exp-1", workshopImage), /Pause the published workshop/);
  await assert.rejects(service.removeWorkshopPhoto("cook-1", "exp-1"), /Pause the published workshop/);
});

test("direct publishing rejects invalid event data and dates inside the booking cutoff", async () => {
  assert.equal(publishExperienceSchema.body.safeParse({ title: "x" }).success, false);
  assert.equal(publishExperienceSchema.body.safeParse({
    type: "HOME_DINING", title: "Sunday table", theme: "Theme",
    description: "A sufficiently long event description.", cuisine: "Indian",
    isVegetarian: true, menuNotes: "Menu", pricePerPerson: 500, maxGuests: 4, capacity: 12,
    durationMinutes: 60, location: "12 Example Road, Pune", startsAt: "2026-10-25T12:00:00Z",
  }).success, false);
  const validData = {
    idempotencyKey: "e8787ad1-9709-4a12-94f7-dfd8bcadd6ac",
    type: "HOME_DINING", title: "Sunday table", theme: "Theme",
    description: "A sufficiently long event description.", cuisine: "Indian",
    isVegetarian: true, menuNotes: "Menu", pricePerPerson: 500, maxGuests: 3,
    capacity: 12, durationMinutes: 60, location: "12 Example Road, Pune", startsAt: "2026-10-25T12:00:00Z",
  };
  assert.equal(publishExperienceSchema.body.safeParse(validData).success, true);
  assert.equal(publishExperienceSchema.body.safeParse({ ...validData, capacity: 0 }).success, false);
  assert.equal(publishExperienceSchema.body.safeParse({ ...validData, capacity: 101 }).success, false);
  const { db, state } = fixture();
  const request = {
    idempotencyKey: "87fe58bc-b4a3-4e0f-bd39-b68de2242b7c",
    type: "WORKSHOP", title: "Pasta class", theme: "Fresh pasta",
    description: "Learn to make fresh pasta from scratch.",
    teachingContent: "Prepare fresh pasta dough and shape it by hand.", learningOutcomes: "Learn to knead dough and shape two pasta forms.", pricePerPerson: 1200,
    maxGuests: 3, capacity: 12, durationMinutes: 90, location: "12 Example Road, Kothrud, Pune",
    startsAt: "2026-10-17T19:00:00+05:30",
  };
  const service = createCookExperiencesService(db, { now: () => now, storage: storageFixture() });
  await assert.rejects(service.publishNew("cook-1", publishExperienceSchema.body.parse(request), workshopImage), /at least 6 hours in the future/);
  assert.equal(state.experiences.length, 0);
  assert.equal(state.slots.length, 0);
});

test("publish retries reuse one event and one slot; reusing the key for changed fields conflicts", async () => {
  const { db, state } = fixture();
  const service = createCookExperiencesService(db, { now: () => now });
  const input = publishExperienceSchema.body.parse({
    idempotencyKey: "e05ceec8-86df-4d77-8490-0ab149ee17c1",
    type: "HOME_DINING", title: "Sunday table", theme: "Family recipes",
    description: "A long-form description for the home dining event.", cuisine: "Maharashtrian",
    isVegetarian: true, menuNotes: "Seasonal menu", pricePerPerson: 900,
    maxGuests: 3, capacity: 12, durationMinutes: 180, location: "12 Example Road, Kothrud, Pune",
    startsAt: "2026-10-25T18:00:00+05:30",
  });
  const [first, retry] = await Promise.all([service.publishNew("cook-1", input), service.publishNew("cook-1", input)]);
  assert.equal(first.id, retry.id);
  assert.equal(state.experiences.length, 1);
  assert.equal(state.slots.length, 1);
  await assert.rejects(service.publishNew("cook-1", { ...input, pricePerPerson: 950 }), /already used for different event details/);
  await assert.rejects(service.publishNew("cook-1", { ...input, capacity: 13 }), /already used for different event details/);
  assert.equal(state.experiences.length, 1);
  assert.equal(state.slots.length, 1);
});

test("direct publishing reports the existing profile-photo prerequisite clearly", async () => {
  const { db, state } = fixture({ cooks: [{ ...readyCook, profileImage: null }] });
  const service = createCookExperiencesService(db, { now: () => now });
  const input = publishExperienceSchema.body.parse({
    idempotencyKey: "5e22dad1-0489-4bf8-88f4-6e38c241a65b",
    type: "HOME_DINING", title: "Sunday table", theme: "Family recipes",
    description: "A long-form description for the home dining event.", cuisine: "Maharashtrian",
    isVegetarian: true, menuNotes: "Seasonal menu", pricePerPerson: 900,
    maxGuests: 3, capacity: 12, durationMinutes: 180, location: "12 Example Road, Kothrud, Pune",
    startsAt: "2026-10-25T18:00:00+05:30",
  });
  await assert.rejects(service.publishNew("cook-1", input), /Add a kitchen profile photo before publishing an event/);
  assert.equal(state.experiences.length, 0);
  assert.equal(state.slots.length, 0);
});

test("published experiences can be paused without changing legacy booking status", async () => {
  const { db, state } = fixture({ experiences: [baseExperience({ status: "PUBLISHED" })] });
  const result = await createCookExperiencesService(db, { now: () => now }).pause("cook-1", "exp-1");
  assert.equal(result.status, "PAUSED");
  assert.equal(state.experiences[0].status, "PAUSED");
});

test("slot validation requires explicit offsets and normalizes offset times to UTC instants", async () => {
  const utcInput = createExperienceSlotSchema.body.safeParse({ startsAt: "2026-10-20T12:00:00.000Z", endsAt: "2026-10-20T13:00:00.000Z", capacity: 4 });
  assert.equal(utcInput.success, true);
  const offsetInput = createExperienceSlotSchema.body.parse({ startsAt: "2026-10-20T18:00:00+05:30", endsAt: "2026-10-20T19:00:00+05:30", capacity: 4 });
  assert.equal(offsetInput.startsAt.toISOString(), "2026-10-20T12:30:00.000Z");
  assert.equal(offsetInput.endsAt.toISOString(), "2026-10-20T13:30:00.000Z");
  assert.equal(createExperienceSlotSchema.body.safeParse({ startsAt: "2026-10-20T12:00:00", endsAt: "2026-10-20T13:00:00", capacity: 4 }).success, false);
  assert.equal(createExperienceSlotSchema.body.safeParse({ startsAt: "2026-13-40T12:00:00Z", endsAt: "2026-10-20T13:00:00Z", capacity: 4 }).success, false);
  assert.equal(updateExperienceDraftSchema.body.safeParse({ maxGuests: 4 }).success, true);
  const { db } = fixture({ experiences: [baseExperience()] });
  const service = createCookExperiencesService(db, { now: () => now });
  await assert.rejects(service.createSlot("cook-1", "exp-1", { startsAt: new Date("2026-10-16T12:00:00Z"), endsAt: new Date("2026-10-16T13:00:00Z"), capacity: 4 }), /future start/);
  await assert.rejects(service.createSlot("cook-1", "exp-1", { startsAt: new Date("2026-10-20T13:00:00Z"), endsAt: new Date("2026-10-20T12:00:00Z"), capacity: 4 }), /end after/);
  assert.equal(updateExperienceSlotSchema.body.safeParse({ capacity: 0 }).success, false);
});

test("Cook can add and list future slots only for an owned experience", async () => {
  const { db } = fixture({ experiences: [baseExperience()] });
  const service = createCookExperiencesService(db, { now: () => now });
  const created = await service.createSlot("cook-1", "exp-1", {
    startsAt: new Date("2026-10-20T12:00:00Z"), endsAt: new Date("2026-10-20T14:00:00Z"), capacity: 5,
  });
  assert.equal(created.availableSeats, 5);
  assert.deepEqual((await service.listSlots("cook-1", "exp-1")).items.map(({ id }) => id), [created.id]);
  await assert.rejects(service.listSlots("cook-2", "exp-1"), { statusCode: 404 });
  await assert.rejects(service.createSlot("cook-2", "exp-1", {
    startsAt: new Date("2026-10-20T12:00:00Z"), endsAt: new Date("2026-10-20T14:00:00Z"), capacity: 5,
  }), { statusCode: 404 });
});

test("slot capacity cannot fall below active held seats and booked slots cannot be rescheduled or cancelled", async () => {
  const slot = { id: "slot-1", experienceId: "exp-1", startsAt: new Date("2026-10-20T12:00:00Z"), endsAt: new Date("2026-10-20T14:00:00Z"), capacity: 6, availableSeats: 2, status: "OPEN" };
  const { db, state } = fixture({ experiences: [baseExperience()], slots: [slot], bookings: [{ id: "booking-1", experienceId: "exp-1", slotId: "slot-1", status: "CONFIRMED", numberOfGuests: 4 }] });
  const service = createCookExperiencesService(db, { now: () => now });
  await assert.rejects(service.updateSlot("cook-1", "exp-1", "slot-1", { capacity: 3 }), /below the seats held/);
  await assert.rejects(service.updateSlot("cook-1", "exp-1", "slot-1", { startsAt: new Date("2026-10-21T12:00:00Z"), endsAt: new Date("2026-10-21T14:00:00Z") }), /cannot be rescheduled/);
  await assert.rejects(service.cancelSlot("cook-1", "exp-1", "slot-1"), /cannot be cancelled/);
  assert.equal(state.slots[0].status, "OPEN");
});

test("unbooked slots can be soft-cancelled without deleting them and photo upload is owner-scoped", async () => {
  const slot = { id: "slot-1", experienceId: "exp-1", startsAt: new Date("2026-10-20T12:00:00Z"), endsAt: new Date("2026-10-20T14:00:00Z"), capacity: 6, availableSeats: 6, status: "OPEN" };
  const { db, state } = fixture({ experiences: [baseExperience()], slots: [slot] });
  const service = createCookExperiencesService(db, { now: () => now, storage: { uploadPublicMarketplaceImage: async () => ({ secureUrl: "https://images.example/experience.jpg" }) } });
  const cancelled = await service.cancelSlot("cook-1", "exp-1", "slot-1");
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(state.slots.length, 1);
  await assert.rejects(service.uploadPhoto("cook-2", "exp-1", { buffer: Buffer.from("image"), originalname: "event.jpg" }), { statusCode: 404 });
  const photo = await service.uploadPhoto("cook-1", "exp-1", { buffer: Buffer.from("image"), originalname: "event.jpg" });
  assert.deepEqual(photo.photos, ["photo-url", "https://images.example/experience.jpg"]);
  assert.equal(state.experiences[0].privateAddress, "12 Example Road, Pune");
});

test("customer booking projection never returns a Cook's private experience address", async () => {
  const service = createCustomerEventsService({ experienceBooking: { findMany: async () => [{
    id: "booking-1", experienceId: "exp-1", bookingDate: now, numberOfGuests: 2, totalAmount: 100,
    status: "CONFIRMED", createdAt: now,
    experience: { title: "Dinner", location: "Public area only", privateAddress: "Private home address" },
  }] } });
  const result = await service.listMyBookings("customer-1");
  assert.equal(result.items[0].venue, "Public area only");
  assert.equal(JSON.stringify(result).includes("Private home address"), false);
});

test("experience timing defaults remain configurable through existing platform settings validation", () => {
  assert.deepEqual(updatePlatformSettingsSchema.body.parse({}), {});
  assert.deepEqual(updatePlatformSettingsSchema.body.parse({
    experienceCancellationWindowHours: 48,
    experienceCookResponseWindowHours: 24,
    experienceBookingCutoffHours: 6,
    experiencePaymentHoldMinutes: 15,
  }), {
    experienceCancellationWindowHours: 48,
    experienceCookResponseWindowHours: 24,
    experienceBookingCutoffHours: 6,
    experiencePaymentHoldMinutes: 15,
  });
  assert.equal(updatePlatformSettingsSchema.body.safeParse({ experiencePaymentHoldMinutes: 0 }).success, false);
});
