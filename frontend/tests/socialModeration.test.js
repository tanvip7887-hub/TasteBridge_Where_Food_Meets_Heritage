import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Customer Stories provides report actions for Posts, active Stories, comments, and replies", async () => {
  const [page, interactions, dialog, api] = await Promise.all([
    read("../src/pages/StoriesPage.jsx"),
    read("../src/components/social/PostInteractions.jsx"),
    read("../src/components/social/ReportContentDialog.jsx"),
    read("../src/api/socialApi.js"),
  ]);
  assert.match(page, /ReportContentDialog targetType="STORY"/);
  assert.match(interactions, /ReportContentDialog targetType="POST"/);
  assert.match(interactions, /ReportContentDialog targetType="COMMENT"/);
  assert.match(interactions, /onReport=\{setReportTarget\}/);
  assert.match(dialog, /OPEN_AUTH_MODAL_EVENT/);
  assert.match(dialog, /500/);
  assert.match(api, /post\("\/social\/reports", payload\)/);
});

test("Admin social moderation is routed to the protected Admin panel and exposes review actions", async () => {
  const [routes, layout, page, api, backendRoutes] = await Promise.all([
    read("../src/routes/AppRoutes.jsx"),
    read("../src/layouts/AdminLayout.jsx"),
    read("../src/pages/admin/AdminSocialReports.jsx"),
    read("../src/api/adminApi.js"),
    read("../../backend/src/modules/admin/admin.routes.js"),
  ]);
  assert.match(routes, /path="social-reports" element=\{<AdminSocialReports \/>}/);
  assert.match(layout, /path: "\/admin\/social-reports"/);
  assert.match(page, /MARK_REVIEWED/);
  assert.match(page, /DISMISS/);
  assert.match(page, /HIDE/);
  assert.match(api, /\/admin\/social-reports/);
  assert.match(backendRoutes, /router\.use\(authenticate, requireRole\("ADMIN"\)\)/);
  assert.match(backendRoutes, /router\.patch\("\/social-reports\/:id"/);
});
