import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COOK_ORDER_STATUS_OPTIONS,
  calculateOrderCounts,
  getStatusGroup,
} from "../src/pages/cook/panel/cookOrderConstants.js";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("cook order status constants define all five requested categories with backend-mapped statuses", () => {
  const expectedLabels = [
    "Pending / New Orders",
    "Confirmed / Preparing",
    "Ready for Pickup",
    "Completed",
    "Cancelled",
  ];

  const actualLabels = COOK_ORDER_STATUS_OPTIONS.map((opt) => opt.label);
  assert.deepEqual(actualLabels, expectedLabels);

  const pending = getStatusGroup("pending");
  assert.deepEqual(pending.statuses, ["PENDING"]);

  const preparing = getStatusGroup("preparing");
  assert.deepEqual(preparing.statuses, ["CONFIRMED", "PREPARING"]);

  const ready = getStatusGroup("ready");
  assert.deepEqual(ready.statuses, ["READY_FOR_PICKUP"]);

  const completed = getStatusGroup("completed");
  assert.deepEqual(completed.statuses, ["DELIVERED", "OUT_FOR_DELIVERY"]);

  const cancelled = getStatusGroup("cancelled");
  assert.deepEqual(cancelled.statuses, ["CANCELLED"]);
});

test("calculateOrderCounts accurately counts orders into status buckets", () => {
  const mockOrders = [
    { id: "1", status: "PENDING" },
    { id: "2", status: "PENDING" },
    { id: "3", status: "CONFIRMED" },
    { id: "4", status: "PREPARING" },
    { id: "5", status: "READY_FOR_PICKUP" },
    { id: "6", status: "OUT_FOR_DELIVERY" },
    { id: "7", status: "DELIVERED" },
    { id: "8", status: "CANCELLED" },
  ];

  const counts = calculateOrderCounts(mockOrders);
  assert.equal(counts.pending, 2);
  assert.equal(counts.preparing, 2);
  assert.equal(counts.ready, 1);
  assert.equal(counts.completed, 2);
  assert.equal(counts.cancelled, 1);
  assert.equal(counts.total, 8);
});

test("CookLayout renders clean Food Orders navigation without status submenu in left sidebar", async () => {
  const layout = await readSource("../src/layouts/CookLayout.jsx");

  // Food orders navigation item
  assert.match(layout, /label:\s*"Food orders"/);
  assert.match(layout, /path:\s*"\/cook\/orders"/);

  // Status submenu is removed from the left sidebar
  assert.doesNotMatch(layout, /aria-label="Toggle Food orders submenu"/);
  assert.doesNotMatch(layout, /setOrdersSubmenuOpen/);

  // Passes orders and counts to Outlet for the orders page tabs
  assert.match(layout, /<Outlet[\s\S]*context=\{\{[\s\S]*orderCounts/);
});

test("Cook panel omits the avatar dropdown while keeping its profile and portal navigation", async () => {
  const layout = await readSource("../src/layouts/CookLayout.jsx");
  const customerNavbar = await readSource("../src/components/layout/Navbar.jsx");

  assert.doesNotMatch(layout, /Cook profile menu|profileDropdownOpen|profileMenuRef|ChevronDown/);
  assert.match(layout, /label:\s*"Kitchen profile"/);
  assert.match(layout, /Switch to Marketplace/);
  assert.match(layout, /Sign Out/);
  assert.match(customerNavbar, /Favourites/);
});

test("Cook panel removes the unavailable Help item and redirects its old route", async () => {
  const layout = await readSource("../src/layouts/CookLayout.jsx");
  const routes = await readSource("../src/routes/AppRoutes.jsx");

  assert.doesNotMatch(layout, /label:\s*"Help"|\/cook\/help|HelpCircle/);
  assert.match(routes, /<Route path="help" element=\{<Navigate to="\/cook" replace \/>\} \/>/);
  assert.doesNotMatch(routes, /title="Help"|icon=\{HelpCircle\}/);
});

test("CookOrdersPage filters by status query parameter and opens matching order details in a drawer", async () => {
  const page = await readSource("../src/pages/cook/panel/CookOrdersPage.jsx");

  // Reads status parameter and filters
  assert.match(page, /searchParams\.get\("status"\)/);
  assert.match(page, /activeGroup\.statuses\.includes\(order\.status\)/);

  // Cards are filtered by the active status and selected details are kept separate in the drawer.
  assert.match(page, /const drawerOrder = orders\.find\(\(item\) => item\.id === drawerOrderId\)/);
  assert.match(page, /setDrawerOrderId\(orderId\)/);
  assert.match(page, /<OrderDetailsDrawer/);

  // Order details preserve the existing fulfillment and billing data.
  assert.match(page, /order\.totalAmount/);
  assert.match(page, /orderAddress\?\.recipientName/);
  assert.match(page, /orderAddress\?\.phone/);
  assert.match(page, /Dishes & Quantities/);
  assert.match(page, /Billing Breakdown/);
  assert.doesNotMatch(page, /Click to view details/);
  assert.doesNotMatch(page, /No order selected/);
});
