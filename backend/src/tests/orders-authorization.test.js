import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { requireCustomerOrderAccess } from "../modules/orders/orders.auth.js";

const authorize = (user) => {
  let error;
  let continued = false;
  requireCustomerOrderAccess({ user }, {}, (nextError) => {
    error = nextError;
    continued = !nextError;
  });
  return { error, continued };
};

test("customer order routes require the active Customer portal for account-owned history", () => {
  assert.equal(authorize(null).error.statusCode, 401);
  assert.equal(authorize({ role: "CUSTOMER", activePortal: "CUSTOMER", status: "ACTIVE" }).continued, true);
  assert.equal(authorize({ role: "COOK", activePortal: "CUSTOMER", status: "ACTIVE", cookProfile: { verificationStatus: "APPROVED" } }).continued, true);
  assert.equal(authorize({ role: "COOK", activePortal: "COOK", status: "ACTIVE", cookProfile: { verificationStatus: "APPROVED" } }).error.statusCode, 403);
  assert.equal(authorize({ role: "COOK", activePortal: "CUSTOMER", status: "ACTIVE", cookProfile: { verificationStatus: "PENDING" } }).continued, true);
  assert.equal(authorize({ role: "COOK", activePortal: "COOK", status: "ACTIVE", cookProfile: { verificationStatus: "PENDING" } }).error.statusCode, 403);
  assert.equal(authorize({ role: "DELIVERY_AGENT", activePortal: "DELIVERY_AGENT", status: "ACTIVE" }).error.statusCode, 403);
  assert.equal(authorize({ role: "ADMIN", activePortal: "ADMIN", status: "ACTIVE" }).error.statusCode, 403);
  assert.equal(authorize({ role: "CUSTOMER", activePortal: "CUSTOMER", status: "SUSPENDED" }).error.statusCode, 403);
});

test("customer order routes use order authorization, while delivery history stays on its own route", async () => {
  const [orderRoutes, deliveryRoutes] = await Promise.all([
    readFile(new URL("../modules/orders/orders.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../modules/delivery-agent/delivery-agent.routes.js", import.meta.url), "utf8"),
  ]);
  assert.match(orderRoutes, /router\.use\(authenticate, requireCustomerOrderAccess\)/);
  assert.doesNotMatch(orderRoutes, /requireCartCustomer/);
  assert.match(deliveryRoutes, /router\.get\("\/deliveries\/history", requireApprovedDeliveryAgent, listDeliveryHistory\)/);
});
