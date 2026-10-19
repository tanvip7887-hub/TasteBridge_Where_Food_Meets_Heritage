import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin notification center marks all unread items read and clears them from the list", async () => {
  const page = await readFile(new URL("../src/pages/admin/AdminNotifications.jsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../src/api/adminApi.js", import.meta.url), "utf8");
  assert.match(page, /Mark all as read/);
  assert.match(page, /markAllNotificationsAsRead\(\)/);
  assert.match(page, /setNotifications\(\[\]\)/);
  assert.match(page, /filter\(\(notification\) => !notification\.isRead\)/);
  assert.match(api, /patch\("\/admin\/notifications\/read-all"\)/);
});

test("admin sidebar stays unchanged while the customer navbar uses the shared notification bell", async () => {
  const adminLayout = await readFile(new URL("../src/layouts/AdminLayout.jsx", import.meta.url), "utf8");
  const customerNavbar = await readFile(new URL("../src/components/layout/Navbar.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(adminLayout, /label: "Notifications"/);
  assert.doesNotMatch(adminLayout, /Customer Storefront/);
  assert.match(customerNavbar, /canUseCustomerNotifications && \(/);
  assert.match(customerNavbar, /data-customer-notifications-toggle/);
  assert.match(customerNavbar, /notificationApi\.list\(\{ page: 1, limit: 30 \}\)/);
});
