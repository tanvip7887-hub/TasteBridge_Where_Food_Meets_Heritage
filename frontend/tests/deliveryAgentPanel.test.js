import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("delivery-agent panel exposes the grouped navigation and responsive mobile drawer", async () => {
  const layout = await read("../src/layouts/DeliveryAgentLayout.jsx");
  for (const label of ["Home", "Available", "Current delivery", "History", "Earnings", "My profile"]) {
    assert.ok(layout.includes(`label: "${label}"`), `${label} navigation entry`);
  }
  assert.doesNotMatch(layout, /label: "Help"|\/delivery-agent\/help|CircleHelp/);
  assert.match(layout, /setMobileMenuOpen\(true\)/);
  assert.match(layout, /lg:hidden/);
  assert.match(layout, /bg-\[#D2552B\] text-white/);
  assert.match(layout, /Switch|Customer/);
  assert.match(layout, /role="switch"/);
  assert.match(layout, /disabled=\{availabilityLocked\}/);
  assert.match(layout, /refreshDashboard\(\)/);
});

test("delivery home renders backend summary, readiness blockers, errors, and retry", async () => {
  const home = await read("../src/pages/delivery/DeliveryAgentHomePage.jsx");
  assert.match(home, /useOutletContext/);
  assert.match(home, /completedDeliveriesToday/);
  assert.match(home, /deliveryFeesEarnedToday/);
  assert.match(home, /pendingRequirements/);
  assert.match(home, /currentDelivery/);
  assert.match(home, /refreshDashboard\(\)\.catch/);
  assert.match(home, /No active delivery/);
  assert.match(home, /Review profile and documents/);
  assert.doesNotMatch(home, /waitingForPayout|delivery notifications|payout records yet/);
});

test("delivery-agent UI uses the shared notifications bell and disables unavailable sections", async () => {
  const layout = await read("../src/layouts/DeliveryAgentLayout.jsx");
  assert.match(layout, /notificationApi\.list\(\{ page: 1, limit: 30 \}\)/);
  assert.match(layout, /aria-label="Delivery agent notifications"/);
  assert.match(layout, /Mark all as read/);
  assert.doesNotMatch(layout, /userId\s*:|portal\s*:/);
  assert.match(layout, /aria-disabled="true"/);
  assert.match(layout, /deliveryAssignmentAvailable/);
  assert.match(layout, /earningsAvailable/);
});

test("delivery-agent My Profile displays real application data and secure document previews", async () => {
  const [routes, profile, readiness] = await Promise.all([
    read("../src/routes/AppRoutes.jsx"),
    read("../src/pages/delivery/DeliveryAgentProfilePage.jsx"),
    read("../../backend/src/modules/delivery-agent/delivery-agent-readiness.js"),
  ]);
  assert.match(routes, /path="profile" element=\{<DeliveryAgentProfilePage \/>\}/);
  assert.match(profile, /deliveryAgentApi\.getMyApplication/);
  assert.match(profile, /deliveryAgentApi\.getDocument\(document\.id\)/);
  assert.match(profile, /URL\.revokeObjectURL/);
  assert.match(profile, /deliveryAgentApi\.submitPayoutDetails/);
  assert.match(profile, /name="upiId"/);
  assert.match(profile, /Payout details submitted\. They are awaiting admin approval\./);
  assert.match(profile, /Awaiting admin approval/);
  assert.match(profile, /Update and resubmit/);
  assert.match(readiness, /awaiting admin approval/);
  assert.match(readiness, /rejectionReason/);
  const [agentApi, adminApi, adminPage] = await Promise.all([
    read("../src/api/deliveryAgentApi.js"),
    read("../src/api/adminApi.js"),
    read("../src/pages/admin/AdminDeliveryAgents.jsx"),
  ]);
  assert.match(agentApi, /post\("\/delivery-agents\/payout-details"/);
  assert.match(adminApi, /reviewDeliveryAgentPayoutDetails/);
  assert.match(adminPage, /Approve details/);
  assert.match(adminPage, /Reject details/);
  assert.match(adminPage, /Rejection reason \(required to reject\)/);
  const sectionPage = await read("../src/pages/delivery/DeliveryAgentSectionPage.jsx");
  assert.match(sectionPage, /deliveryAgentApi\.listAvailableDeliveries/);
  assert.match(sectionPage, /deliveryAgentApi\.claimDelivery/);
  assert.match(sectionPage, /deliveryAgentApi\.markDeliveryPickedUp/);
  assert.match(sectionPage, /deliveryAgentApi\.markDeliveryCompleted/);
  assert.match(sectionPage, /deliveryAgentApi\.confirmCodCollection/);
  assert.match(sectionPage, /Confirm cash collected/);
  assert.match(sectionPage, /paymentStatus/);
  assert.match(sectionPage, /does not show or initiate payout settlement/);
});

test("delivery section routes remain behind the approved-agent route", async () => {
  const routes = await read("../src/routes/AppRoutes.jsx");
  assert.match(routes, /<ApprovedDeliveryAgentRoute>[\s\S]*?<DeliveryAgentLayout\s*\/>[\s\S]*?<Route path="available"/);
  for (const path of ["available", "current", "history", "earnings", "profile"]) {
    assert.ok(routes.includes(`path="${path}"`), `${path} route`);
  }
  assert.match(routes, /<Route path="help" element=\{<Navigate to="\/delivery-agent" replace \/>\} \/>/);
});
