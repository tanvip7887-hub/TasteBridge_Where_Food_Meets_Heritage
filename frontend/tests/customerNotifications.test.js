import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Customer bell uses the authenticated shared API without client identity or portal parameters", async () => {
  const [api, navbar] = await Promise.all([
    readSource("../src/api/notificationApi.js"),
    readSource("../src/components/layout/Navbar.jsx"),
  ]);
  assert.match(api, /api\.get\("\/notifications", \{ params \}\)/);
  assert.match(api, /api\.patch\(`\/notifications\/\$\{encodeURIComponent\(id\)\}\/read`\)/);
  assert.match(api, /api\.patch\("\/notifications\/read-all"\)/);
  assert.doesNotMatch(api, /userId\s*:|portal\s*:/);
  assert.match(navbar, /isAuthenticated && activePortal === "CUSTOMER"/);
  assert.match(navbar, /notificationApi\.list\(\{ page: 1, limit: 30 \}\)/);
});

test("Customer notification bell covers loading, empty, error, retry, timestamps, read state, and unread badge", async () => {
  const navbar = await readSource("../src/components/layout/Navbar.jsx");
  assert.match(navbar, /notificationsLoading/);
  assert.match(navbar, /Loading notifications/);
  assert.match(navbar, /No notifications yet\./);
  assert.match(navbar, /notificationsError/);
  assert.match(navbar, />Retry<\/button>/);
  assert.match(navbar, /notification\.createdAt\)\.toLocaleString\(\)/);
  assert.match(navbar, /notification\.isRead \? "Read"/);
  assert.match(navbar, /currentNotificationCount > 0/);
});

test("individual read state changes only after server confirmation and failure retains state", async () => {
  const navbar = await readSource("../src/components/layout/Navbar.jsx");
  const request = navbar.indexOf("await notificationApi.markRead(notification.id)");
  const confirmation = navbar.indexOf("payload?.isRead !== true", request);
  const stateUpdate = navbar.indexOf("setNotifications((items) => items.map", confirmation);
  assert.ok(request >= 0 && confirmation > request && stateUpdate > confirmation);
  assert.match(navbar, /setNotificationActionError\(error\?\.message/);
});

test("mark-all read changes the list only after the shared endpoint confirms zero unread", async () => {
  const navbar = await readSource("../src/components/layout/Navbar.jsx");
  const request = navbar.indexOf("await notificationApi.markAllRead()");
  const confirmation = navbar.indexOf("payload.unreadCount !== 0", request);
  const stateUpdate = navbar.indexOf("setNotifications((items) => items.map((item) => ({ ...item, isRead: true })))", confirmation);
  assert.ok(request >= 0 && confirmation > request && stateUpdate > confirmation);
  assert.match(navbar, /Mark all as read/);
  assert.match(navbar, /Could not mark all notifications as read/);
});

test("backend notification service scopes all list and read operations by session user and validated portal", async () => {
  const [auth, service] = await Promise.all([
    readSource("../../backend/src/modules/notifications/notifications.auth.js"),
    readSource("../../backend/src/modules/notifications/notifications.service.js"),
  ]);
  assert.match(auth, /req\.notificationPortal = portal/);
  assert.match(service, /const where = \{ userId, portal \}/);
  assert.match(service, /where: \{ \.\.\.where, isRead: false \}/);
  assert.match(service, /where: \{ userId, portal, isRead: false \}/);
});
