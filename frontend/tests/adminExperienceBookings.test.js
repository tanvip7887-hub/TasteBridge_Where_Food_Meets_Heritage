import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Admin booking sections have separate protected routes, navigation, and API methods", async () => {
  const [routes, layout, api] = await Promise.all([
    read("../src/routes/AppRoutes.jsx"), read("../src/layouts/AdminLayout.jsx"), read("../src/api/adminApi.js"),
  ]);
  assert.match(routes, /path="dine-bookings" element={<AdminExperienceBookings experienceType="HOME_DINING" \/>}/);
  assert.match(routes, /path="workshop-bookings" element={<AdminExperienceBookings experienceType="WORKSHOP" \/>}/);
  assert.match(routes, /<RoleRoute allowedRoles=\{\["ADMIN"\]\}>\s*<AdminLayout \/>/);
  assert.match(layout, /label: "Dine Bookings", path: "\/admin\/dine-bookings"/);
  assert.match(layout, /label: "Workshop Bookings", path: "\/admin\/workshop-bookings"/);
  assert.match(api, /getDineBookings: \(params, config = \{\}\) => api\.get\("\/admin\/dine-bookings", \{ \.\.\.config, params \}\)/);
  assert.match(api, /getWorkshopBookings: \(params, config = \{\}\) => api\.get\("\/admin\/workshop-bookings", \{ \.\.\.config, params \}\)/);
});

test("Admin booking page supports type-specific read, search, filters, pagination and refund details", async () => {
  const page = await read("../src/pages/admin/AdminExperienceBookings.jsx");
  assert.match(page, /experienceType = "HOME_DINING"/);
  assert.match(page, /adminApi\.getWorkshopBookings\(params/);
  assert.match(page, /adminApi\.getDineBookings\(params/);
  assert.match(page, /aria-label="Search bookings"/);
  assert.match(page, /Filter booking status/);
  assert.match(page, /Filter payment status/);
  assert.match(page, /Previous/);
  assert.match(page, /Next/);
  assert.match(page, /Cancellation reason/);
  assert.match(page, /Refund record/);
});

test("Cook booking routes and API remain separate and available", async () => {
  const [routes, api, layout] = await Promise.all([
    read("../src/routes/AppRoutes.jsx"), read("../src/api/cookApi.js"), read("../src/layouts/CookLayout.jsx"),
  ]);
  assert.match(routes, /path="dine-bookings" element={<CookBookingsPage experienceType="HOME_DINING" \/>}/);
  assert.match(routes, /path="workshop-bookings" element={<CookBookingsPage experienceType="WORKSHOP" \/>}/);
  assert.match(api, /getExperienceBookings: \(\) => api\.get\("\/cooks\/experience-bookings\/dine"\)/);
  assert.match(api, /getWorkshopExperienceBookings: \(\) => api\.get\("\/cooks\/experience-bookings\/workshops"\)/);
  assert.match(layout, /path: "\/cook\/dine-bookings"/);
  assert.match(layout, /path: "\/cook\/workshop-bookings"/);
});
