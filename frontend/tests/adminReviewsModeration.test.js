import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("AdminReviews page loads reported review queue using reviewsApi.reportedForAdmin", async () => {
  const pageCode = await read("../src/pages/admin/AdminReviews.jsx");

  // API call
  assert.match(pageCode, /reviewsApi\s*\.\s*reportedForAdmin\(/);
  assert.match(pageCode, /limit:\s*20/);
});

test("AdminReviews page displays review rating, comment, subject name, verified badge, and cook/customer names", async () => {
  const pageCode = await read("../src/pages/admin/AdminReviews.jsx");

  // Rating & stars
  assert.match(pageCode, /review\.rating\s*\?\?\s*5\}\/5/);
  assert.match(pageCode, /fill-amber-400/);

  // Customer comment
  assert.match(pageCode, /review\.comment/);

  // Subject title
  assert.match(pageCode, /review\.subjectName/);

  // Verified badges (food vs event)
  assert.match(pageCode, /isFood\s*\?\s*"Verified order"\s*:\s*"Attended event"/);

  // Privacy-safe customer and cook names
  assert.match(pageCode, /review\.customerName/);
  assert.match(pageCode, /review\.cookName/);

  // Cook report box & reason
  assert.match(pageCode, /Cook report reason/);
  assert.match(pageCode, /item\.reason/);
});

test("AdminReviews page provides useful status and type filters", async () => {
  const pageCode = await read("../src/pages/admin/AdminReviews.jsx");

  // Status tabs: Active Reports, Kept Published, Hidden, All Reports
  assert.match(pageCode, /filter-status-active/);
  assert.match(pageCode, /filter-status-kept/);
  assert.match(pageCode, /filter-status-hidden/);
  assert.match(pageCode, /filter-status-all/);

  // Type tabs: All Types, Food Orders, Events
  assert.match(pageCode, /filter-type-all/);
  assert.match(pageCode, /filter-type-food/);
  assert.match(pageCode, /filter-type-experience/);
});

test("AdminReviews page provides Keep and Hide review moderation actions", async () => {
  const pageCode = await read("../src/pages/admin/AdminReviews.jsx");

  // Keep button & testid
  assert.match(pageCode, /data-testid=\{`keep-btn-\$\{item\.id\}`\}/);
  assert.match(pageCode, /Keep review/);

  // Hide button & testid
  assert.match(pageCode, /data-testid=\{`hide-btn-\$\{item\.id\}`\}/);
  assert.match(pageCode, /Hide review/);

  // Modal dialog
  assert.match(pageCode, /role="dialog"/);
  assert.match(pageCode, /aria-modal="true"/);
  assert.match(pageCode, /reviewsApi\s*\.\s*moderate\(/);
});

test("AdminReviews moderation modal requires 5 to 500 characters when hiding a review", async () => {
  const pageCode = await read("../src/pages/admin/AdminReviews.jsx");

  // Character requirement and live counter
  assert.match(pageCode, /type === "HIDE" && trimmed\.length < 5/);
  assert.match(pageCode, /trimmed\.length > 500/);
  assert.match(pageCode, /maxLength=\{500\}/);
  assert.match(pageCode, /reasonDraft\.length\}\/500/);
  assert.match(pageCode, /disabled=\{submitting \|\| \(modalState\.type === "HIDE" && reasonDraft\.trim\(\)\.length < 5\)\}/);
});

test("AppRoutes protects /admin/reviews under RoleRoute with ADMIN role", async () => {
  const routesCode = await read("../src/routes/AppRoutes.jsx");

  assert.match(routesCode, /allowedRoles=\{\["ADMIN"\]\}/);
  assert.match(routesCode, /<Route path="reviews" element=\{<AdminReviews \/>\} \/>/);
});

test("AdminLayout navigation includes Reviews section pointing to /admin/reviews", async () => {
  const layoutCode = await read("../src/layouts/AdminLayout.jsx");

  assert.match(layoutCode, /label:\s*"Reviews"/);
  assert.match(layoutCode, /path:\s*"\/admin\/reviews"/);
});
