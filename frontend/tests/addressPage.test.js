import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("address page calls authenticated CRUD APIs and exposes required delivery fields", async () => {
  const [page, api] = await Promise.all([
    source("../src/pages/AddressesPage.jsx"),
    source("../src/api/addressApi.js"),
  ]);
  for (const field of ["recipientName", "phone", "addressLine1", "addressLine2", "locality", "city", "state", "pincode", "landmark"]) {
    assert.ok(page.includes(JSON.stringify(field)), `expected address form to include ${field}`);
  }
  for (const operation of ["addressApi.list", "addressApi.create", "addressApi.update", "addressApi.setDefault", "addressApi.remove"]) {
    assert.ok(page.includes(operation), `expected page to use ${operation}`);
  }
  for (const method of ["list", "getDefault", "create", "update", "setDefault", "remove"]) {
    assert.match(api, new RegExp(`\\b${method}:`));
  }
  assert.match(page, /window\.confirm\(/);
  assert.match(page, /No saved addresses yet/);
  assert.match(page, /role="alert"/);
});

test("profile links to the persistent address page and the route requires authentication", async () => {
  const [profile, routes] = await Promise.all([
    source("../src/pages/Profile.jsx"),
    source("../src/routes/AppRoutes.jsx"),
  ]);
  assert.match(profile, /to="\/addresses"/);
  assert.match(routes, /path="addresses"\s+element=\{<ProtectedRoute><AddressesPage \/><\/ProtectedRoute>\}/);
});
