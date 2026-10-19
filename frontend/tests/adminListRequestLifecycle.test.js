import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("admin filtered lists cancel stale requests and ignore stale responses", async () => {
  const pages = [
    ["AdminCooks.jsx", "verificationFilter"],
    ["AdminCustomers.jsx", "statusFilter"],
    ["AdminDeliveryAgents.jsx", "verificationFilter"],
    ["AdminDishes.jsx", "statusFilter"],
    ["AdminExperiences.jsx", "statusFilter, experienceType"],
    ["AdminOrders.jsx", "statusFilter"],
  ];

  for (const [file, filter] of pages) {
    const source = await readSource(`../src/pages/admin/${file}`);
    assert.match(source, /useCallback\(async \(\) =>/i, `${file} uses a stable filtered fetch callback`);
    assert.match(source, new RegExp(`\\}, \\[${filter}\\]\\);`), `${file} refreshes when its filter changes`);
    assert.match(source, /new AbortController\(\)/, `${file} can cancel an obsolete request`);
    assert.match(source, /requestControllerRef\.current\?\.abort\(\)/, `${file} aborts the previous request`);
    assert.match(source, /requestId !== requestIdRef\.current/, `${file} ignores stale responses`);
    assert.match(source, /requestControllerRef\.current\?\.abort\(\);\s*requestIdRef\.current \+= 1;/, `${file} cancels work on effect cleanup`);
  }
});

test("admin list API methods accept request cancellation without changing params", async () => {
  const api = await readSource("../src/api/adminApi.js");
  for (const method of ["getAllCooks", "getAllDeliveryAgents", "getAllCustomers", "getAllDishes", "getAllOrders", "getAllExperiences"]) {
    assert.ok(api.includes(`${method}: (params, config = {}) => api.get(`), `${method} accepts request config`);
    assert.ok(api.includes("{ ...config, params }"), `${method} forwards request config without replacing filters`);
  }
});

test("initial admin and Cook dish loads ignore results after unmount", async () => {
  const pages = [
    ["../src/pages/admin/AdminCategories.jsx", "getFoodCategories"],
    ["../src/pages/admin/AdminDashboard.jsx", "getDashboardStats"],
    ["../src/pages/admin/AdminNotifications.jsx", "getNotifications"],
    ["../src/pages/admin/AdminPayments.jsx", "getPaymentStats"],
    ["../src/pages/admin/AdminSettings.jsx", "getPlatformSettings"],
    ["../src/pages/admin/AdminVerifications.jsx", "getPendingVerifications"],
  ];

  for (const [path, request] of pages) {
    const source = await readSource(path);
    assert.match(source, new RegExp(`let active = true;[\\s\\S]*?${request}\\(`), `${path} guards its initial request`);
    assert.match(source, /if \(active\) setLoading\(false\);/, `${path} settles loading only while mounted`);
    assert.match(source, /return \(\) => \{ active = false; \};/, `${path} invalidates the request on unmount`);
  }

  const dishes = await readSource("../src/pages/cook/panel/CookDishesPage.jsx");
  assert.match(dishes, /let active = true;[\s\S]*?Promise\.all\(\[cookApi\.getDishes\(\), cookApi\.getCategories\(\)\]\)/);
  assert.match(dishes, /if \(!active\) return;[\s\S]*?setDishes\(dishesData\);[\s\S]*?setCategories\(categoriesData\);/);
  assert.match(dishes, /return \(\) => \{ active = false; \};/);
});

test("Cook and Delivery application fetches share one in-flight request", async () => {
  const [cook, delivery] = await Promise.all([
    readSource("../src/pages/cook/BecomeCookPage.jsx"),
    readSource("../src/pages/delivery/BecomeDeliveryAgentPage.jsx"),
  ]);

  for (const [name, source] of [["Cook", cook], ["Delivery Agent", delivery]]) {
    assert.match(source, /useCallback\(async \(\) =>/i, `${name} fetch callback is stable`);
    assert.match(source, /if \(applicationRequestRef\.current\) return applicationRequestRef\.current;/, `${name} reuses an in-flight lookup`);
    assert.match(source, /applicationRequestRef\.current = null;/, `${name} clears the in-flight lookup after completion`);
  }
});
