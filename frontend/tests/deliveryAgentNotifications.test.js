import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("notification bell is restricted to an approved Delivery Agent with that portal active", async () => {
  const [layout, auth, route, notificationRoutes] = await Promise.all([
    read("../src/layouts/DeliveryAgentLayout.jsx"),
    read("../src/utils/deliveryAgentAuth.js"),
    read("../src/routes/ApprovedDeliveryAgentRoute.jsx"),
    read("../../backend/src/modules/notifications/notifications.routes.js"),
  ]);
  assert.match(layout, /user\?\.activePortal === "DELIVERY_AGENT" && isApprovedDeliveryAgent\(user\)/);
  assert.match(auth, /verificationStatus === "APPROVED"/);
  assert.match(route, /isApprovedDeliveryAgent\(user\)/);
  assert.match(notificationRoutes, /router\.use\(authenticate, requireNotificationPortal\)/);
});

test("Delivery Agent bell uses shared authenticated endpoints without user or portal arguments", async () => {
  const [layout, api] = await Promise.all([
    read("../src/layouts/DeliveryAgentLayout.jsx"),
    read("../src/api/notificationApi.js"),
  ]);
  assert.match(layout, /notificationApi\.list\(\{ page: 1, limit: 30 \}\)/);
  assert.match(layout, /notificationApi\.markRead\(notification\.id\)/);
  assert.match(layout, /notificationApi\.markAllRead\(\)/);
  assert.doesNotMatch(api, /userId\s*:|portal\s*:/);
});

test("Delivery Agent bell includes loading, empty, error/retry, refresh-on-open, timestamps, and unread state", async () => {
  const layout = await read("../src/layouts/DeliveryAgentLayout.jsx");
  assert.match(layout, /notificationsLoading/);
  assert.match(layout, /Loading notifications/);
  assert.match(layout, /No notifications yet\./);
  assert.match(layout, /notificationsError/);
  assert.match(layout, /Retry/);
  assert.match(layout, /onClick=\{\(\) => void loadDeliveryAgentNotifications\(\)\}/);
  assert.match(layout, /if \(opening\) void loadDeliveryAgentNotifications\(\)/);
  assert.match(layout, /notification\.createdAt \? new Date\(notification\.createdAt\)\.toLocaleString\(\)/);
  assert.match(layout, /notification\.isRead \? "Read" : .*"Unread"/);
  assert.match(layout, /currentUnreadNotificationCount > 0/);
});

test("individual read status changes only after the API confirms success and preserves failed state", async () => {
  const layout = await read("../src/layouts/DeliveryAgentLayout.jsx");
  const request = layout.indexOf("unwrap(await notificationApi.markRead(notification.id))");
  const confirmation = layout.indexOf("payload?.isRead !== true", request);
  const update = layout.indexOf("setNotifications((items) => items.map", confirmation);
  assert.ok(request >= 0 && confirmation > request && update > confirmation);
  assert.match(layout, /setNotificationActionError\(error\?\.message/);
});

test("mark-all state changes only after the shared API confirms there are no unread notifications", async () => {
  const layout = await read("../src/layouts/DeliveryAgentLayout.jsx");
  const request = layout.indexOf("unwrap(await notificationApi.markAllRead())");
  const confirmation = layout.indexOf("payload.unreadCount !== 0", request);
  const update = layout.indexOf("setNotifications((items) => items.map((item) => ({ ...item, isRead: true })))", confirmation);
  assert.ok(request >= 0 && confirmation > request && update > confirmation);
  assert.match(layout, /Could not mark all notifications as read/);
});

test("notification reads remain scoped to authenticated user and validated active portal on the backend", async () => {
  const [auth, service] = await Promise.all([
    read("../../backend/src/modules/notifications/notifications.auth.js"),
    read("../../backend/src/modules/notifications/notifications.service.js"),
  ]);
  assert.match(auth, /req\.notificationPortal = portal/);
  assert.match(service, /const where = \{ userId, portal \}/);
  assert.match(service, /where: \{ \.\.\.where, isRead: false \}/);
  assert.match(service, /where: \{ userId, portal, isRead: false \}/);
});
