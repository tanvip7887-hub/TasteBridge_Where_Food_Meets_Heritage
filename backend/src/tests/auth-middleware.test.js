import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import {
  createAuthenticate,
  requireApprovedCook,
  requireApprovedDeliveryAgent,
} from "../middlewares/auth.js";
import env from "../config/env.js";
import { requireCustomerOrderAccess } from "../modules/orders/orders.auth.js";

const invokeProtectedCookRoute = async (user) => {
  const priorSecret = env.JWT_SECRET;
  if (!env.JWT_SECRET) env.JWT_SECRET = "isolated-auth-test-secret";

  const authenticateFixture = createAuthenticate(async () => user);
  const token = jwt.sign({ userId: user?.id ?? "fixture-user" }, env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  let authError;
  await authenticateFixture(req, {}, (error) => {
    authError = error;
  });

  let routeError = authError;
  let allowed = false;
  if (!authError) {
    requireApprovedCook(req, {}, (error) => {
      routeError = error;
      allowed = !error;
    });
  }

  if (!priorSecret) env.JWT_SECRET = priorSecret;
  return { routeError, allowed };
};

const invokeProtectedDeliveryAgentRoute = async (user) => {
  const priorSecret = env.JWT_SECRET;
  if (!env.JWT_SECRET) env.JWT_SECRET = "isolated-auth-test-secret";

  const authenticateFixture = createAuthenticate(async () => user);
  const token = jwt.sign({ userId: user?.id ?? "fixture-user" }, env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  let authError;
  await authenticateFixture(req, {}, (error) => {
    authError = error;
  });

  let routeError = authError;
  let allowed = false;
  if (!authError) {
    requireApprovedDeliveryAgent(req, {}, (error) => {
      routeError = error;
      allowed = !error;
    });
  }

  if (!priorSecret) env.JWT_SECRET = priorSecret;
  return { routeError, allowed };
};

test("unauthenticated protected cook request returns 401", async () => {
  let nextError;
  await createAuthenticate(async () => null)({ headers: {} }, {}, (error) => {
    nextError = error;
  });
  assert.equal(nextError.statusCode, 401);
});

test("active customer is authenticated but denied the cook-only route", async () => {
  const { routeError, allowed } = await invokeProtectedCookRoute({
    id: "customer-1",
    status: "ACTIVE",
    role: "CUSTOMER",
    cookProfile: null,
    deliveryAgent: null,
  });
  assert.equal(allowed, false);
  assert.equal(routeError.statusCode, 403);
});

for (const status of ["PENDING", "SUSPENDED", "DEACTIVATED"]) {
  test(`${status.toLowerCase()} account is denied by authentication`, async () => {
    const { routeError, allowed } = await invokeProtectedCookRoute({
      id: `user-${status.toLowerCase()}`,
      status,
      role: "COOK",
      cookProfile: { verificationStatus: "APPROVED" },
      deliveryAgent: null,
    });
    assert.equal(allowed, false, `${status} must not reach the protected route`);
    assert.equal(routeError.statusCode, 403, `${status} must receive 403`);
  });
}

test("active approved cook passes authentication and Cook Panel authorization", async () => {
  const { routeError, allowed } = await invokeProtectedCookRoute({
    id: "approved-cook-1",
    status: "ACTIVE",
    role: "COOK",
    cookProfile: { verificationStatus: "APPROVED" },
    deliveryAgent: null,
  });
  assert.equal(routeError, undefined);
  assert.equal(allowed, true);
});

test("unauthenticated delivery-agent request returns 401", () => {
  let nextError;
  requireApprovedDeliveryAgent({ user: null }, {}, (error) => {
    nextError = error;
  });
  assert.equal(nextError.statusCode, 401);
});

test("active customer cannot access delivery-agent-protected functionality", async () => {
  const { routeError, allowed } = await invokeProtectedDeliveryAgentRoute({
    id: "customer-2",
    status: "ACTIVE",
    role: "CUSTOMER",
    cookProfile: null,
    deliveryAgent: null,
  });
  assert.equal(allowed, false);
  assert.equal(routeError.statusCode, 403);
});

for (const verificationStatus of ["PENDING", "REJECTED", "NEEDS_REVISION"]) {
  test(`delivery-agent role with ${verificationStatus.toLowerCase()} profile is denied`, async () => {
    const { routeError, allowed } = await invokeProtectedDeliveryAgentRoute({
      id: `agent-${verificationStatus.toLowerCase()}`,
      status: "ACTIVE",
      role: "DELIVERY_AGENT",
      cookProfile: null,
      deliveryAgent: { verificationStatus },
    });
    assert.equal(allowed, false);
    assert.equal(routeError.statusCode, 403);
  });
}

test("delivery-agent role with a missing profile is denied", async () => {
  const { routeError, allowed } = await invokeProtectedDeliveryAgentRoute({
    id: "agent-no-profile",
    status: "ACTIVE",
    role: "DELIVERY_AGENT",
    cookProfile: null,
    deliveryAgent: null,
  });
  assert.equal(allowed, false);
  assert.equal(routeError.statusCode, 403);
});

test("active approved delivery agent passes authorization", async () => {
  const { routeError, allowed } = await invokeProtectedDeliveryAgentRoute({
    id: "approved-agent-1",
    status: "ACTIVE",
    role: "DELIVERY_AGENT",
    cookProfile: null,
    deliveryAgent: { verificationStatus: "APPROVED" },
  });
  assert.equal(routeError, undefined);
  assert.equal(allowed, true);
});

test("approved delivery agent in Customer portal can read their customer order history", async () => {
  const user = {
    id: "multi-role-user",
    status: "ACTIVE",
    role: "DELIVERY_AGENT",
    cookProfile: { verificationStatus: "APPROVED" },
    deliveryAgent: { verificationStatus: "APPROVED" },
  };
  const priorSecret = env.JWT_SECRET;
  if (!env.JWT_SECRET) env.JWT_SECRET = "isolated-auth-test-secret";
  const token = jwt.sign({ userId: user.id, activePortal: "CUSTOMER" }, env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  let authError;
  await createAuthenticate(async () => user)(req, {}, (error) => { authError = error; });
  let orderError;
  requireCustomerOrderAccess(req, {}, (error) => { orderError = error; });
  assert.equal(authError, undefined);
  assert.equal(orderError, undefined);
  assert.equal(req.user.role, "CUSTOMER");
  assert.equal(req.user.accountRole, "DELIVERY_AGENT");
  assert.deepEqual(req.user.availablePortals, ["CUSTOMER", "COOK", "DELIVERY_AGENT"]);
  if (!priorSecret) env.JWT_SECRET = priorSecret;
});

test("unapproved portal claims fall back to Customer and cannot open restricted routes", async () => {
  const user = { id: "pending-cook", status: "ACTIVE", role: "CUSTOMER", cookProfile: { verificationStatus: "PENDING" }, deliveryAgent: null };
  const priorSecret = env.JWT_SECRET;
  if (!env.JWT_SECRET) env.JWT_SECRET = "isolated-auth-test-secret";
  const token = jwt.sign({ userId: user.id, activePortal: "COOK" }, env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  let authError;
  await createAuthenticate(async () => user)(req, {}, (error) => { authError = error; });
  let cookError;
  requireApprovedCook(req, {}, (error) => { cookError = error; });
  assert.equal(authError, undefined);
  assert.equal(req.user.activePortal, "CUSTOMER");
  assert.equal(cookError.statusCode, 403);
  if (!priorSecret) env.JWT_SECRET = priorSecret;
});
