import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("cook orders page loads real orders and distinguishes loading, empty, and error states with retry", async () => {
  const [page, api] = await Promise.all([
    readSource("../src/pages/cook/panel/CookOrdersPage.jsx"),
    readSource("../src/api/cookApi.js"),
  ]);
  assert.match(page, /cookApi\.getOrders\(\)/);
  assert.match(api, /getOrders:\s*\(\)\s*=>\s*api\.get\("\/cooks\/orders"\)/);
  assert.match(page, /Loading your orders/);
  assert.match(page, /No orders received yet/);
  assert.match(page, /Orders could not be loaded/);
  assert.match(page, /onClick=\{\(\) => void loadOrders\(\)\}/);
  assert.match(page, /aria-label="Cook orders"/);
  assert.match(page, /aria-label="Loading orders"/);
  assert.match(page, /aria-label="Order status filter tabs"/);
});

test("cook can accept only a pending order and the list refreshes after backend success", async () => {
  const page = await readSource("../src/pages/cook/panel/CookOrdersPage.jsx");
  const api = await readSource("../src/api/cookApi.js");
  assert.match(api, /acceptOrder:\s*\(id\)\s*=>\s*api\.patch\(`\/cooks\/orders\/\$\{id\}\/accept`\)/);
  assert.match(page, /const canAcceptOrder = item\.status === "PENDING"/);
  assert.match(page, /await cookApi\.acceptOrder\(orderId\)/);
  assert.match(page, /await loadOrders\(\{ showLoading: false \}\)/);
  assert.match(page, /disabled=\{Boolean\(actionOrderId\)\}/);
  assert.match(page, /Order accepted\. Its status is now Confirmed\./);
  assert.match(page, /function OrderActionBar/);
  assert.match(page, /Accept order/);
});

test("cook page exposes only the next legal preparation action at each status", async () => {
  const [page, api] = await Promise.all([
    readSource("../src/pages/cook/panel/CookOrdersPage.jsx"),
    readSource("../src/api/cookApi.js"),
  ]);
  assert.match(api, /prepareOrder:\s*\(id\)\s*=>\s*api\.patch\(`\/cooks\/orders\/\$\{id\}\/prepare`\)/);
  assert.match(api, /markOrderReady:\s*\(id\)\s*=>\s*api\.patch\(`\/cooks\/orders\/\$\{id\}\/ready`\)/);
  assert.match(page, /selected\.status === "CONFIRMED"\) return \{ label: "Start preparing"[\s\S]*request: cookApi\.prepareOrder/);
  assert.match(page, /selected\.status === "PREPARING"\) return \{ label: "Mark ready for pickup"[\s\S]*request: cookApi\.markOrderReady/);
  assert.match(page, /order\.status === "READY_FOR_PICKUP"[\s\S]*Ready for pickup/);
  assert.match(page, /disabled=\{Boolean\(actionOrderId\)\}/);
});

test("cook order cards display fulfillment snapshots without exposing mutation controls", async () => {
  const page = await readSource("../src/pages/cook/panel/CookOrdersPage.jsx");
  assert.match(page, /order\.checkout\?\.addressSnapshot \|\| order\.address/);
  assert.match(page, /item\.name/);
  assert.match(page, /item\.quantity/);
  assert.match(page, /item\.unitPrice/);
  assert.match(page, /item\.totalPrice/);
  assert.match(page, /order\.paymentStatus/);
  assert.doesNotMatch(page, /cookApi\.rejectOrder\(/);
  assert.match(page, /item\.dishImage/);
  assert.match(page, /aria-label="Ordered dishes"/);
});

test("order details open in an accessible drawer and preserve the full order information", async () => {
  const page = await readSource("../src/pages/cook/panel/CookOrdersPage.jsx");
  assert.match(page, /function OrderDetailsDrawer/);
  assert.match(page, /role="dialog" aria-modal="true"/);
  assert.match(page, /aria-label="Close"/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /event\.key !== "Tab"/);
  assert.match(page, /event\.target === event\.currentTarget\) onClose\(\)/);
  assert.match(page, /fallbackElement\.focus\(\)/);
  assert.match(page, /Customer & Delivery/);
  assert.match(page, /Dishes & Quantities/);
  assert.match(page, /Billing Breakdown/);
  assert.match(page, /onOpen=\{\(event\) => openDrawer\(item\.id, event\.currentTarget\)\}/);
});
