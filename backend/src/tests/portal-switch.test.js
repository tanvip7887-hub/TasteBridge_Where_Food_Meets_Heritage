import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import env from "../config/env.js";
import { createPortalSwitchService } from "../modules/auth/auth.service.js";
import { getAvailablePortals, resolveActivePortal, serializePortalUser } from "../modules/auth/portal-access.js";

const createDb = (user) => ({ user: { findUnique: async () => user } });

test("login portal resolution remains valid for single-role and multi-role accounts", () => {
  const customer = { status: "ACTIVE", role: "CUSTOMER", cookProfile: null, deliveryAgent: null };
  const cook = { status: "ACTIVE", role: "COOK", cookProfile: { verificationStatus: "APPROVED" }, deliveryAgent: null };
  const agent = { status: "ACTIVE", role: "DELIVERY_AGENT", cookProfile: null, deliveryAgent: { verificationStatus: "APPROVED" } };
  const multiRole = { ...agent, cookProfile: { verificationStatus: "APPROVED" } };
  const pendingAgent = { ...agent, deliveryAgent: { verificationStatus: "PENDING" } };

  assert.deepEqual(getAvailablePortals(customer), ["CUSTOMER"]);
  assert.equal(resolveActivePortal(customer, customer.role), "CUSTOMER");
  assert.deepEqual(getAvailablePortals(cook), ["CUSTOMER", "COOK"]);
  assert.equal(resolveActivePortal(cook, cook.role), "COOK");
  assert.deepEqual(getAvailablePortals(agent), ["CUSTOMER", "DELIVERY_AGENT"]);
  assert.equal(resolveActivePortal(agent, agent.role), "DELIVERY_AGENT");
  assert.deepEqual(getAvailablePortals(multiRole), ["CUSTOMER", "COOK", "DELIVERY_AGENT"]);
  assert.equal(resolveActivePortal(multiRole, multiRole.role), "DELIVERY_AGENT");
  const backendSessionUser = serializePortalUser(multiRole, "CUSTOMER");
  assert.equal(backendSessionUser.cookProfile.verificationStatus, "APPROVED");
  assert.equal(backendSessionUser.deliveryAgent.verificationStatus, "APPROVED");
  assert.deepEqual(backendSessionUser.availablePortals, ["CUSTOMER", "COOK", "DELIVERY_AGENT"]);
  assert.deepEqual(getAvailablePortals(pendingAgent), ["CUSTOMER"]);
  assert.equal(resolveActivePortal(pendingAgent, "DELIVERY_AGENT"), "CUSTOMER");
});

test("portal switching signs the selected, profile-authorized portal without changing the user record", async () => {
  const priorSecret = env.JWT_SECRET;
  if (!env.JWT_SECRET) env.JWT_SECRET = "isolated-portal-test-secret";
  const user = {
    id: "agent-customer",
    name: "Test User",
    status: "ACTIVE",
    role: "DELIVERY_AGENT",
    passwordHash: "never-return-this",
    cookProfile: null,
    deliveryAgent: { verificationStatus: "APPROVED" },
  };
  const switchPortal = createPortalSwitchService(createDb(user));
  const result = await switchPortal(user.id, "CUSTOMER");
  const claims = jwt.decode(result.token);
  assert.equal(claims.activePortal, "CUSTOMER");
  assert.equal(result.user.role, "CUSTOMER");
  assert.equal(result.user.accountRole, "DELIVERY_AGENT");
  assert.deepEqual(result.user.availablePortals, ["CUSTOMER", "DELIVERY_AGENT"]);
  assert.equal("passwordHash" in result.user, false);
  assert.equal(user.role, "DELIVERY_AGENT");
  if (!priorSecret) env.JWT_SECRET = priorSecret;
});

test("portal switching rejects unapproved Cook access and Admin cannot leave Admin portal", async () => {
  const pendingCookSwitch = createPortalSwitchService(createDb({
    id: "pending-cook", status: "ACTIVE", role: "CUSTOMER", cookProfile: { verificationStatus: "PENDING" }, deliveryAgent: null,
  }));
  await assert.rejects(pendingCookSwitch("pending-cook", "COOK"), (error) => error.statusCode === 403);

  const pendingAgentSwitch = createPortalSwitchService(createDb({
    id: "pending-agent", status: "ACTIVE", role: "CUSTOMER", cookProfile: null,
    deliveryAgent: { verificationStatus: "PENDING" },
  }));
  await assert.rejects(pendingAgentSwitch("pending-agent", "DELIVERY_AGENT"), (error) => error.statusCode === 403);

  const adminSwitch = createPortalSwitchService(createDb({
    id: "admin", status: "ACTIVE", role: "ADMIN", cookProfile: null, deliveryAgent: null,
  }));
  await assert.rejects(adminSwitch("admin", "CUSTOMER"), (error) => error.statusCode === 403);
});
