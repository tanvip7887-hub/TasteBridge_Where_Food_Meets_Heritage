import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../modules/payments/payments.routes.js", import.meta.url), "utf8");

test("every payment route is mounted behind authentication and customer authorization", () => {
  const guardIndex = source.indexOf("router.use(authenticate, requireCartCustomer)");
  assert.notEqual(guardIndex, -1);
  for (const route of [
    'router.post("/online-checkouts"',
    'router.get("/attempts/:id"',
    'router.post("/attempts/:id/confirm"',
    'router.post("/attempts/:id/cancel"',
  ]) {
    const routeIndex = source.indexOf(route);
    assert.notEqual(routeIndex, -1, `missing ${route}`);
    assert.ok(routeIndex > guardIndex, `${route} must follow the router authorization guard`);
  }
});
