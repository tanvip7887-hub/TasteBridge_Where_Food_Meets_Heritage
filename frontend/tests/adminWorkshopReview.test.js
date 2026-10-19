import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Admin navigation separates Dine management from Workshop review routes", async () => {
  const [layout, routes] = await Promise.all([
    read("../src/layouts/AdminLayout.jsx"),
    read("../src/routes/AppRoutes.jsx"),
  ]);
  assert.match(layout, /label: "Dine", path: "\/admin\/dine"/);
  assert.match(layout, /label: "Workshops", path: "\/admin\/workshops"/);
  assert.match(routes, /path="dine" element={<AdminExperiences experienceType="HOME_DINING" \/>}/);
  assert.match(routes, /path="workshops" element={<AdminExperiences experienceType="WORKSHOP" \/>}/);
  assert.match(routes, /path="experiences" element={<Navigate to="\/admin\/dine" replace \/>}/);
});

test("Admin workshop review uses the authorized backend action and displays schedule, images, and rejection feedback", async () => {
  const [page, api, backend] = await Promise.all([
    read("../src/pages/admin/AdminExperiences.jsx"),
    read("../src/api/adminApi.js"),
    read("../../backend/src/modules/admin/admin.routes.js"),
  ]);
  assert.match(page, /type: experienceType/);
  assert.match(page, /Schedule and availability/);
  assert.match(page, /exp\.reviewRejectionReason/);
  assert.match(page, /Approve and publish/);
  assert.match(page, /Rejection reason \(required to reject\)/);
  assert.match(api, /reviewWorkshop: \(id, data\) => api\.patch\(`\/admin\/workshops/);
  assert.match(backend, /router\.use\(authenticate, requireRole\("ADMIN"\)\)/);
  assert.match(backend, /router\.patch\("\/workshops\/:id\/review", validate\(reviewWorkshopSchema\), reviewWorkshop\)/);
});

test("Cook workshop submissions stay pending until Admin review; public discovery requires PUBLISHED", async () => {
  const [cookService, publicService, cookPage] = await Promise.all([
    read("../../backend/src/modules/cook/cook-experiences.service.js"),
    read("../../backend/src/modules/events/public-experiences.service.js"),
    read("../src/pages/cook/panel/CookExperiencesPage.jsx"),
  ]);
  assert.match(cookService, /input\.type === "WORKSHOP" \? "PENDING" : "PUBLISHED"/);
  assert.match(cookPage, /Workshop submitted for Admin review/);
  assert.match(cookPage, /Customers cannot see or book this workshop until it is approved/);
  assert.match(publicService, /status: "PUBLISHED"/);
});
