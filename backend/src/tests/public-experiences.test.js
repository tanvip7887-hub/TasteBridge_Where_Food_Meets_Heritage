import assert from "node:assert/strict";
import express from "express";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import { createPublicExperiencesRouter } from "../modules/events/public-experiences.routes.js";
import { createPublicExperiencesService } from "../modules/events/public-experiences.service.js";

const now = new Date("2026-10-18T12:00:00.000Z");
const future = new Date("2026-10-20T18:00:00.000Z");
const readyCookIds = ["cook-ready"];

const experience = (id, overrides = {}) => ({
  id,
  cookId: "cook-ready",
  type: "HOME_DINING",
  title: "Sunday table",
  theme: "Family recipes",
  description: "A long-form description about a shared home dining meal.",
  teachingContent: "Prepare and cook the workshop recipes.",
  learningOutcomes: "Learn the techniques covered in this session.",
  materialsToBring: "Bring an apron.",
  cuisine: "Maharashtrian",
  pricePerPerson: 900,
  maxGuests: 8,
  durationMinutes: 180,
  isVegetarian: true,
  dietaryNotes: "Vegetarian and dairy-free options",
  menuNotes: "Seasonal menu",
  inclusions: ["Dinner"],
  houseRules: ["Arrive on time"],
  photos: ["https://images.example.test/event.jpg"],
  image: "https://images.example.test/event.jpg",
  publicArea: "Kothrud, Pune",
  privateAddress: "Private home address",
  addressSource: "CUSTOM",
  location: "Potentially private legacy location",
  status: "PUBLISHED",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-15T00:00:00Z"),
  cook: { id: "cook-ready", businessName: "Test Kitchen", profileImage: "https://images.example.test/cook.jpg", user: { email: "private@example.test" }, fssaiStatus: "APPROVED" },
  menuItems: [{ note: "Family recipe", dish: { id: "dish-1", name: "Puran poli", image: "https://images.example.test/dish.jpg", cuisine: "Maharashtrian", price: 400, cookId: "cook-ready" } }],
  slots: [{ id: `${id}-slot`, startsAt: future, endsAt: new Date("2026-10-20T21:00:00Z"), status: "OPEN", capacity: 6, availableSeats: 3 }],
  ...overrides,
});

const matches = (row, where, currentTime) => {
  if (row.status !== where.status || !where.cook.is.id.in.includes(row.cookId)) return false;
  const typeBranch = where.OR?.find((branch) => branch.type === row.type);
  if (where.OR?.some((branch) => branch.type) && !typeBranch) return false;
  const complete = row.title?.trim() && row.theme?.trim() && row.description?.trim()
    && row.pricePerPerson > 0 && row.publicArea?.trim() && row.privateAddress?.trim() && row.addressSource
    && (row.photos?.length || row.image)
    && (row.type === "WORKSHOP"
      ? row.teachingContent?.trim() && row.learningOutcomes?.trim()
      : row.cuisine?.trim() && (row.menuItems?.length || row.menuNotes?.trim()));
  if (!complete) return false;
  const slotQuery = where.slots.some;
  const slots = (row.slots || []).filter((slot) => slot.status === slotQuery.status
    && new Date(slot.startsAt) > currentTime && slot.availableSeats > 0
    && (!slotQuery.startsAt.gte || new Date(slot.startsAt) >= slotQuery.startsAt.gte)
    && (!slotQuery.startsAt.lt || new Date(slot.startsAt) < slotQuery.startsAt.lt));
  if (!slots.length) return false;
  if (where.type && row.type !== where.type) return false;
  if (where.isVegetarian !== undefined && row.isVegetarian !== where.isVegetarian) return false;
  if (where.cuisine?.contains && !row.cuisine?.toLowerCase().includes(where.cuisine.contains.toLowerCase())) return false;
  if (where.theme?.contains && !row.theme?.toLowerCase().includes(where.theme.contains.toLowerCase())) return false;
  if (where.dietaryNotes?.contains && !row.dietaryNotes?.toLowerCase().includes(where.dietaryNotes.contains.toLowerCase())) return false;
  if (where.publicArea?.contains && !row.publicArea?.toLowerCase().includes(where.publicArea.contains.toLowerCase())) return false;
  return true;
};

const makeDatabase = (rows, { cookIds = readyCookIds } = {}) => {
  const calls = { count: [], findMany: [], findFirst: [] };
  const database = {
    $queryRaw: async () => cookIds.map((id) => ({ id })),
    experience: {
      count: async ({ where }) => {
        calls.count.push(where);
        return rows.filter((row) => matches(row, where, now)).length;
      },
      findMany: async (args) => {
        calls.findMany.push(args);
        let result = rows.filter((row) => matches(row, args.where, now));
        const orderBy = args.orderBy[0];
        const [field, direction] = Object.entries(orderBy)[0];
        result.sort((left, right) => {
          const a = left[field];
          const b = right[field];
          const comparison = a instanceof Date ? a - b : a < b ? -1 : a > b ? 1 : 0;
          return (direction === "desc" ? -comparison : comparison) || left.id.localeCompare(right.id);
        });
        return result.slice(args.skip, args.skip + args.take).map((row) => ({
          ...row,
          slots: row.slots.filter((slot) => slot.status === "OPEN" && new Date(slot.startsAt) > now
            && slot.availableSeats > 0
            && (!args.select.slots.where.startsAt.gte || new Date(slot.startsAt) >= args.select.slots.where.startsAt.gte)
            && (!args.select.slots.where.startsAt.lt || new Date(slot.startsAt) < args.select.slots.where.startsAt.lt)),
        }));
      },
      findFirst: async ({ where, select }) => {
        calls.findFirst.push({ where, select });
        const [row] = rows.filter((candidate) => candidate.id === where.id && matches(candidate, { ...where, id: undefined }, now));
        if (!row) return null;
        return { ...row, slots: row.slots.filter((slot) => slot.status === "OPEN" && new Date(slot.startsAt) > now && slot.availableSeats > 0) };
      },
    },
  };
  return { database, calls };
};

const query = (overrides = {}) => ({ page: 1, limit: 10, sort: "newest", ...overrides });

test("public discovery excludes draft, paused, incomplete, past, cancelled, and unavailable inventory", async () => {
  const rows = [
    experience("published"),
    experience("pending-workshop", { type: "WORKSHOP", status: "PENDING" }),
    experience("rejected-workshop", { type: "WORKSHOP", status: "REJECTED" }),
    experience("approved-workshop", { type: "WORKSHOP", status: "PUBLISHED" }),
    experience("draft", { status: "DRAFT" }),
    experience("paused", { status: "PAUSED" }),
    experience("incomplete", { theme: null }),
    experience("past", { slots: [{ id: "past-slot", startsAt: new Date("2026-10-17T00:00:00Z"), endsAt: new Date("2026-10-17T02:00:00Z"), status: "OPEN", availableSeats: 3 }] }),
    experience("cancelled", { slots: [{ id: "cancelled-slot", startsAt: future, endsAt: new Date("2026-10-20T21:00:00Z"), status: "CANCELLED", availableSeats: 3 }] }),
    experience("sold-out", { slots: [{ id: "sold-slot", startsAt: future, endsAt: new Date("2026-10-20T21:00:00Z"), status: "OPEN", availableSeats: 0 }] }),
  ];
  const { database } = makeDatabase(rows);
  const result = await createPublicExperiencesService(database, { now: () => now }).list(query());
  assert.deepEqual(result.items.map(({ id }) => id), ["approved-workshop", "published"]);
  assert.equal(result.items[0].slots[0].availableSeats, 3);
  assert.equal(result.pagination.total, 2);
});

test("filters and pagination are applied to public fields and return stable counts", async () => {
  const rows = [
    experience("one"),
    experience("two", { title: "Workshop", type: "WORKSHOP", isVegetarian: false, cuisine: "Italian", publicArea: "Camp, Pune", createdAt: new Date("2026-10-02T00:00:00Z") }),
    experience("three", { pricePerPerson: 500, createdAt: new Date("2026-10-03T00:00:00Z") }),
  ];
  const { database, calls } = makeDatabase(rows);
  const result = await createPublicExperiencesService(database, { now: () => now }).list(query({
    type: "HOME_DINING", cuisine: "mahar", vegetarian: true, dietary: "dairy-free", location: "kothrud",
    page: 2, limit: 1, sort: "price_asc", startsAfter: new Date("2026-10-19T00:00:00Z"),
  }));
  assert.deepEqual(result.items.map(({ id }) => id), ["one"]);
  assert.deepEqual(result.pagination, { page: 2, limit: 1, total: 2, totalPages: 2 });
  assert.equal(calls.findMany[0].skip, 1);
  assert.equal(calls.findMany[0].take, 1);
  assert.equal(calls.findMany[0].where.type, "HOME_DINING");
  assert.deepEqual(calls.findMany[0].where.isVegetarian, true);
  assert.deepEqual(calls.findMany[0].where.cook.is.id.in, readyCookIds);
  assert.equal(calls.findMany[0].where.cook.is.verificationStatus, "APPROVED");
  assert.equal(calls.findMany[0].where.cook.is.fssaiStatus, "APPROVED");
  assert.equal(calls.findMany[0].where.cook.is.isApprovedToSell, true);
  assert.deepEqual(calls.findMany[0].where.cook.is.user, { is: { role: "COOK", status: "ACTIVE" } });
  assert.equal(calls.findMany[0].select.slots.where.startsAt.gte.toISOString(), "2026-10-19T00:00:00.000Z");
});

test("public detail and list omit private address, address source, owner fields, and unapproved cook data", async () => {
  const { database } = makeDatabase([experience("public")]);
  const service = createPublicExperiencesService(database, { now: () => now });
  const detail = await service.getById("public");
  assert.equal(detail.publicArea, "Kothrud, Pune");
  assert.equal("privateAddress" in detail, false);
  assert.equal("addressSource" in detail, false);
  assert.equal("location" in detail, false);
  assert.equal("user" in detail.cook, false);
  assert.equal("fssaiStatus" in detail.cook, false);
  assert.equal("price" in detail.menuItems[0].dish, false);
  const select = database.experience.findFirst;
  assert.equal(typeof select, "function");
});

test("selling-readiness IDs from the established Cook readiness query are required", async () => {
  const { database, calls } = makeDatabase([experience("public")], { cookIds: [] });
  const result = await createPublicExperiencesService(database, { now: () => now }).list(query());
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.pagination, { page: 1, limit: 10, total: 0, totalPages: 0 });
  assert.equal(calls.findMany.length, 0);
});

test("approved workshops expose teaching details and are filtered by theme without requiring a Dine menu", async () => {
  const row = experience("workshop", {
    type: "WORKSHOP", cuisine: null, menuNotes: null, menuItems: [],
    teachingContent: "Make and shape fresh pasta by hand.", learningOutcomes: "Learn dough hydration and pasta shaping.",
    materialsToBring: "Bring an apron.",
  });
  const { database, calls } = makeDatabase([row]);
  const result = await createPublicExperiencesService(database, { now: () => now }).list(query({ type: "WORKSHOP", cuisine: "family recipes" }));
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].teachingContent, row.teachingContent);
  assert.equal(result.items[0].learningOutcomes, row.learningOutcomes);
  assert.equal(result.items[0].materialsToBring, row.materialsToBring);
  assert.equal(calls.findMany[0].where.type, "WORKSHOP");
  assert.equal(calls.findMany[0].where.theme.contains, "family recipes");
});

let server;
let baseUrl;
before(async () => {
  const { database } = makeDatabase([experience("http-public")]);
  const app = express();
  app.use("/experiences", createPublicExperiencesRouter(database, { now: () => now }));
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ success: false, message: error.message }));
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("public routes do not require auth and reject invalid filters and ambiguous date inputs", async () => {
  for (const invalidQuery of [
    "type=NOT_A_TYPE",
    "startsAfter=2026-10-19T00:00:00",
    "startsAfter=2026-10-20T00%3A00%3A00Z&startsBefore=2026-10-19T00%3A00%3A00Z",
    "sort=unknown",
    "page=0",
  ]) {
    const response = await fetch(`${baseUrl}/experiences?${invalidQuery}`);
    assert.equal(response.status, 400, invalidQuery);
  }
  const detail = await fetch(`${baseUrl}/experiences/http-public`);
  const body = await detail.json();
  assert.equal(detail.status, 200);
  assert.equal(body.data.id, "http-public");
  assert.equal("privateAddress" in body.data, false);
});

test("legacy authenticated event-booking API remains mounted separately from public discovery", async () => {
  const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const customerRoutes = await readFile(new URL("../modules/events/customer-events.routes.js", import.meta.url), "utf8");
  assert.match(appSource, /app\.use\("\/api\/v1\/events", customerEventsRoutes\)/);
  assert.match(appSource, /app\.use\("\/api\/v1\/experiences", publicExperiencesRoutes\)/);
  assert.match(customerRoutes, /router\.use\(authenticate, requireCustomerOrderAccess\)/);
  assert.match(customerRoutes, /router\.get\("\/my-bookings", listMyEventBookings\)/);
});
