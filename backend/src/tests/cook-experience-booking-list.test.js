import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createExperienceBookingsService } from "../modules/events/experience-bookings.service.js";

const mockDatabase = () => {
  const queries = [];
  return {
    queries,
    experienceBooking: {
      findMany: async (query) => { queries.push(query); return []; },
    },
  };
};

test("Cook booking list always scopes by session Cook and pins each requested experience type", async () => {
  const database = mockDatabase();
  const service = createExperienceBookingsService(database);
  await service.listForCook("cook-session-id", "HOME_DINING");
  await service.listForCook("cook-session-id", "WORKSHOP");

  assert.deepEqual(database.queries.map(({ where }) => where), [
    { experience: { cookId: "cook-session-id", type: "HOME_DINING" } },
    { experience: { cookId: "cook-session-id", type: "WORKSHOP" } },
  ]);
  assert.equal(database.queries[0].include.paymentAttempts.take, 1);
  assert.equal(database.queries[0].include.experience.select.type, true);
  assert.equal(database.queries[0].include.experience.select.image, true);
  assert.equal(database.queries[0].include.experience.select.photos, true);
  assert.equal(database.queries[0].include.experience.select.theme, true);
  assert.equal(database.queries[0].include.experience.select.cuisine, true);
  assert.deepEqual(database.queries[0].include.experience.select.menuItems.select.dish.select, {
    name: true,
    image: true,
    cuisine: true,
  });
});

test("invalid Cook booking type is rejected before querying", async () => {
  const database = mockDatabase();
  const service = createExperienceBookingsService(database);
  await assert.rejects(service.listForCook("cook-session-id", "FOOD"), { statusCode: 400 });
  assert.equal(database.queries.length, 0);
});

test("typed Cook booking routes require approved Cook authorization and bind type server-side", async () => {
  const routes = await readFile(new URL("../modules/cook/cook.routes.js", import.meta.url), "utf8");
  const controller = await readFile(new URL("../modules/cook/cook.controller.js", import.meta.url), "utf8");
  for (const route of [
    'router.get("/experience-bookings/dine", requireApprovedCook, getMyDineBookings)',
    'router.get("/experience-bookings/workshops", requireApprovedCook, getMyWorkshopBookings)',
  ]) assert.ok(routes.includes(route), route);
  assert.match(controller, /listForCook\(req\.user\.cookProfile\.id, "HOME_DINING"\)/);
  assert.match(controller, /listForCook\(req\.user\.cookProfile\.id, "WORKSHOP"\)/);
});
