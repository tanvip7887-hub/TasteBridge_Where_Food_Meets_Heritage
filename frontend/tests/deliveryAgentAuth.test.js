import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isApprovedDeliveryAgent } from "../src/utils/deliveryAgentAuth.js";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("an active user with an approved delivery-agent profile is eligible in a multi-role account", () => {
  const approvedUser = {
    status: "ACTIVE",
    role: "DELIVERY_AGENT",
    deliveryAgent: { verificationStatus: "APPROVED" },
  };
  assert.equal(isApprovedDeliveryAgent(approvedUser), true);
  for (const verificationStatus of ["PENDING", "REJECTED", "NEEDS_REVISION", undefined]) {
    assert.equal(isApprovedDeliveryAgent({ ...approvedUser, deliveryAgent: verificationStatus ? { verificationStatus } : null }), false);
  }
  assert.equal(isApprovedDeliveryAgent({ ...approvedUser, role: "CUSTOMER", activePortal: "CUSTOMER", availablePortals: ["CUSTOMER", "DELIVERY_AGENT"] }), true);
  assert.equal(isApprovedDeliveryAgent({ ...approvedUser, availablePortals: ["CUSTOMER"] }), false);
  assert.equal(isApprovedDeliveryAgent({ ...approvedUser, status: "SUSPENDED" }), false);
  assert.equal(isApprovedDeliveryAgent(null), false);
});

test("approved-agent switch, separate guarded panel route, and customer return are wired", async () => {
  const [navbar, routes, guard, layout, panel, api] = await Promise.all([
    readSource("../src/components/layout/Navbar.jsx"),
    readSource("../src/routes/AppRoutes.jsx"),
    readSource("../src/routes/ApprovedDeliveryAgentRoute.jsx"),
    readSource("../src/layouts/DeliveryAgentLayout.jsx"),
    readSource("../src/pages/delivery/DeliveryAgentHomePage.jsx"),
    readSource("../src/api/deliveryAgentApi.js"),
  ]);

  assert.match(navbar, /showDeliveryAgentPortalSwitch\s*\?[\s\S]*?to="\/delivery-agent"[\s\S]*?Switch to Delivery Agent/);
  assert.match(navbar, /showDeliveryAgentPortalSwitch\s*\?[\s\S]*?onClick=\{\(\)\s*=>\s*setMobileMenuOpen\(false\)\}[\s\S]*?Switch to Delivery Agent/);
  assert.equal([...navbar.matchAll(/showCookPortalSwitch\s*\?/g)].length, 2);
  assert.equal([...navbar.matchAll(/!hasDeliveryAgentAccount\s*&&\s*\(showCookPortalSwitch/g)].length, 2);
  assert.match(navbar, /getNavbarPortalSwitchOptions\(user\)/);
  assert.match(routes, /path="\/delivery-agent"[\s\S]*?<ApprovedDeliveryAgentRoute>[\s\S]*?<DeliveryAgentLayout\s*\/>/);
  assert.match(guard, /isApprovedDeliveryAgent\(user\)/);
  assert.match(layout, /to="\/"[\s\S]*?Switch to Customer/);
  assert.match(layout, /deliveryAgentApi\.getPanelAccess\(\)/);
  assert.match(panel, /useOutletContext/);
  assert.match(api, /getPanelAccess:\s*\(\)\s*=>\s*api\.get\(["']\/delivery-agents\/panel["']\)/);
  assert.match(navbar, /to="\/cook"[\s\S]*?Switch to Cook Mode/);
});
