import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAdminExperienceBookingsService } from "../modules/admin/admin.service.js";
import { adminExperienceBookingsQuerySchema } from "../modules/admin/admin.validation.js";

test("Admin booking list enforces the server-selected experience type and paginates", async () => {
  const calls = [];
  const database = {
    experienceBooking: {
      count: async ({ where }) => { calls.push(["count", where]); return 23; },
      findMany: async (query) => { calls.push(["findMany", query]); return [{ id: "booking" }]; },
    },
  };
  const result = await createAdminExperienceBookingsService(database).list("WORKSHOP", {
    page: 2, limit: 10, status: "CONFIRMED", search: "Alex", paymentStatus: "SUCCEEDED",
  });
  for (const [kind, query] of calls) {
    const where = kind === "count" ? query : query.where;
    assert.equal(where.experience.is.type, "WORKSHOP");
    assert.equal(where.status, "CONFIRMED");
    assert.equal(where.paymentAttempts.some.status, "SUCCEEDED");
    assert.ok(where.OR.some((entry) => entry.customer?.is?.name));
  }
  assert.equal(calls[1][1].skip, 10);
  assert.equal(calls[1][1].take, 10);
  assert.deepEqual(result.pagination, { total: 23, page: 2, limit: 10, pages: 3 });
});

test("Admin booking query rejects client-selected type and invalid status", async () => {
  const schema = adminExperienceBookingsQuerySchema.query;
  await assert.rejects(schema.parseAsync({ type: "WORKSHOP" }));
  await assert.rejects(schema.parseAsync({ status: "PUBLISHED" }));
  assert.deepEqual(await schema.parseAsync({ page: "2", limit: "5" }), {
    page: 2, limit: 5,
  });
});

test("Admin booking routes are role-protected and pin each endpoint to a fixed type", async () => {
  const routes = await readFile(new URL("../modules/admin/admin.routes.js", import.meta.url), "utf8");
  const controller = await readFile(new URL("../modules/admin/admin.controller.js", import.meta.url), "utf8");
  assert.match(routes, /router\.use\(authenticate, requireRole\("ADMIN"\)\)/);
  assert.match(routes, /router\.get\("\/dine-bookings", validate\(adminExperienceBookingsQuerySchema\), getAdminDineBookings\)/);
  assert.match(routes, /router\.get\("\/workshop-bookings", validate\(adminExperienceBookingsQuerySchema\), getAdminWorkshopBookings\)/);
  assert.match(controller, /getExperienceBookings\(req, res, next, "HOME_DINING"\)/);
  assert.match(controller, /getExperienceBookings\(req, res, next, "WORKSHOP"\)/);
});
