import assert from "node:assert/strict";
import test from "node:test";
import { getNavbarPortalSwitchOptions, isDeliveryAgentAccount } from "../src/utils/portalSwitchOptions.js";

const customer = {
  status: "ACTIVE",
  role: "CUSTOMER",
  activePortal: "CUSTOMER",
  availablePortals: ["CUSTOMER"],
};

test("Customer-only accounts have no Cook or Delivery Agent switch", () => {
  assert.deepEqual(getNavbarPortalSwitchOptions(customer), { showCook: false, showDeliveryAgent: false });
  assert.equal(isDeliveryAgentAccount(customer), false);
});

test("approved Delivery Agent accounts can switch from Customer without exposing Cook", () => {
  const agent = {
    ...customer,
    availablePortals: ["CUSTOMER", "DELIVERY_AGENT"],
    deliveryAgent: { verificationStatus: "APPROVED" },
  };
  assert.deepEqual(getNavbarPortalSwitchOptions(agent), { showCook: false, showDeliveryAgent: true });
  assert.equal(isDeliveryAgentAccount(agent), true);
});

test("Customer plus approved Delivery Agent accounts do not expose an overlapping Cook portal", () => {
  const multiRole = {
    ...customer,
    availablePortals: ["CUSTOMER", "COOK", "DELIVERY_AGENT"],
    cookProfile: { verificationStatus: "APPROVED" },
    deliveryAgent: { verificationStatus: "APPROVED" },
  };
  assert.deepEqual(getNavbarPortalSwitchOptions(multiRole), { showCook: false, showDeliveryAgent: true });
  assert.equal(isDeliveryAgentAccount(multiRole), true);
  assert.deepEqual(getNavbarPortalSwitchOptions({ ...multiRole, activePortal: "DELIVERY_AGENT" }), {
    showCook: false,
    showDeliveryAgent: false,
  });
});

test("Cook-only accounts retain their existing Cook portal entry point", () => {
  const cook = {
    ...customer,
    availablePortals: ["CUSTOMER", "COOK"],
    cookProfile: { verificationStatus: "APPROVED" },
  };
  assert.deepEqual(getNavbarPortalSwitchOptions(cook), { showCook: true, showDeliveryAgent: false });
  assert.equal(isDeliveryAgentAccount(cook), false);
});

test("unapproved Delivery Agent or Cook profiles never expose their portal switch", () => {
  const pendingAgent = {
    ...customer,
    availablePortals: ["CUSTOMER"],
    deliveryAgent: { verificationStatus: "PENDING" },
    cookProfile: { verificationStatus: "PENDING" },
  };
  assert.deepEqual(getNavbarPortalSwitchOptions(pendingAgent), { showCook: false, showDeliveryAgent: false });
  assert.equal(isDeliveryAgentAccount(pendingAgent), true);
});
