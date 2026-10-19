import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canLoadCookNotifications } from "../src/utils/cookAuth.js";

test("cook notifications load only for an approved cook with the Cook portal active", () => {
  const approvedCook = {
    activePortal: "COOK",
    availablePortals: ["CUSTOMER", "COOK"],
    cookProfile: { verificationStatus: "APPROVED" },
  };
  assert.equal(canLoadCookNotifications(approvedCook), true);
  assert.equal(canLoadCookNotifications({ ...approvedCook, activePortal: "CUSTOMER" }), false);
  assert.equal(canLoadCookNotifications({ ...approvedCook, activePortal: "DELIVERY_AGENT" }), false);
  assert.equal(canLoadCookNotifications({ ...approvedCook, cookProfile: { verificationStatus: "PENDING" } }), false);
  assert.equal(canLoadCookNotifications(null), false);
});

test("CookLayout waits for the validated cook portal before fetching notifications", async () => {
  const layout = await readFile(new URL("../src/layouts/CookLayout.jsx", import.meta.url), "utf8");
  assert.match(layout, /if \(!canFetchCookNotifications\) return;/);
  assert.match(layout, /canFetchCookNotifications, loadCookNotifications/);
});

test("Cook bell loads shared notifications and keeps legacy FSSAI alerts visible", async () => {
  const layout = await readFile(new URL("../src/layouts/CookLayout.jsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../src/api/notificationApi.js", import.meta.url), "utf8");
  assert.match(layout, /notificationApi\.list\(\{ page: 1, limit: 30 \}\)/);
  assert.match(layout, /cookApi\.getNotifications\(\)/);
  assert.match(layout, /source: "shared"/);
  assert.match(layout, /source: "legacy"/);
  assert.match(api, /api\.get\("\/notifications"/);
  assert.doesNotMatch(api, /userId\s*:|params\.portal/);
});

test("CookLayout merges only matching shared and legacy FSSAI events and preserves independent reads", async () => {
  const layout = await readFile(new URL("../src/layouts/CookLayout.jsx", import.meta.url), "utf8");
  const merge = await readFile(new URL("../src/utils/cookNotifications.js", import.meta.url), "utf8");
  assert.match(layout, /mergeCookNotificationFeeds\(sharedNotifications, legacyCookNotifications\)/);
  assert.match(layout, /notification\.sources\?\.find\(\(item\) => !item\.isRead\)/);
  assert.match(merge, /metadata\.eventKey/);
  assert.match(merge, /shared\.title !== legacy\.title \|\| shared\.message !== legacy\.message/);
  assert.match(merge, /isRead: sources\.every\(\(item\) => item\.isRead\)/);
});

test("Cook bell renders loading, empty, error/retry, timestamps, read state, and unread count", async () => {
  const layout = await readFile(new URL("../src/layouts/CookLayout.jsx", import.meta.url), "utf8");
  assert.match(layout, /notificationsLoading/);
  assert.match(layout, /Loading notifications/);
  assert.match(layout, /No notifications yet/);
  assert.match(layout, /notificationsError/);
  assert.match(layout, /onClick=\{loadCookNotifications\}[^>]*className="mt-1 font-bold underline"/);
  assert.match(layout, /notificationUnreadCount > 0/);
  assert.match(layout, /toLocaleString\(\)/);
  assert.match(layout, /notification\.isRead \? "Read" : "Unread"/);
});

test("Cook bell changes read state only after server confirmation and reports failures", async () => {
  const layout = await readFile(new URL("../src/layouts/CookLayout.jsx", import.meta.url), "utf8");
  assert.match(layout, /await notificationApi\.markRead\(targetNotification\.id\)/);
  assert.match(layout, /payload\?\.isRead !== true/);
  assert.match(layout, /setNotificationActionError\(error\?\.message/);
  assert.match(layout, /setSharedNotifications\(\(items\) => items\.map/);
  assert.match(layout, /setSharedUnreadCount\(\(count\) => Math\.max\(0, count - 1\)\)/);
  assert.match(layout, /await loadCookNotifications\(\)/);
});

test("Mark-all confirms both Cook notification stores before clearing the bell badge", async () => {
  const layout = await readFile(new URL("../src/layouts/CookLayout.jsx", import.meta.url), "utf8");
  const [sharedApi, cookApi, routes] = await Promise.all([
    readFile(new URL("../src/api/notificationApi.js", import.meta.url), "utf8"),
    readFile(new URL("../src/api/cookApi.js", import.meta.url), "utf8"),
    readFile(new URL("../../backend/src/modules/cook/cook.routes.js", import.meta.url), "utf8"),
  ]);
  const sharedRequest = layout.indexOf("await notificationApi.markAllRead()");
  const cookRequest = layout.indexOf("await cookApi.markAllNotificationsRead()", sharedRequest);
  const sharedConfirm = layout.indexOf("sharedPayload.unreadCount !== 0", sharedRequest);
  const cookConfirm = layout.indexOf("cookPayload.unreadCount !== 0", cookRequest);
  const clearBadge = layout.indexOf("setLegacyUnreadCount(0)", cookConfirm);

  assert.match(layout, /Mark all as read/);
  assert.ok(sharedRequest >= 0 && sharedConfirm > sharedRequest);
  assert.ok(cookRequest > sharedConfirm && cookConfirm > cookRequest && clearBadge > cookConfirm);
  assert.match(layout, /setSharedUnreadCount\(0\)/);
  assert.match(layout, /notificationRevisionRef\.current \+= 1/);
  assert.match(layout, /notificationActionError/);
  assert.match(layout, /setNotificationActionError/);
  assert.match(sharedApi, /api\.patch\("\/notifications\/read-all"\)/);
  assert.match(cookApi, /markAllNotificationsRead: \(\) => api\.patch\("\/cooks\/notifications\/read-all"\)/);
  assert.match(routes, /router\.patch\("\/notifications\/read-all", requireApprovedCook, markAllMyNotificationsRead\)/);
});
