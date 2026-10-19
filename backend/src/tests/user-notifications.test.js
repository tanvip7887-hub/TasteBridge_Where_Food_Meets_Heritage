import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import app from "../app.js";
import { requireNotificationPortal } from "../modules/notifications/notifications.auth.js";
import { createNotificationsService } from "../modules/notifications/notifications.service.js";
import { notificationIdSchema, notificationListSchema } from "../modules/notifications/notifications.validation.js";

test("notification portal access requires the active customer or approved work portal", () => {
  const authorize = (user) => {
    let error;
    let continued = false;
    requireNotificationPortal({ user }, {}, (nextError) => { error = nextError; continued = !nextError; });
    return { error, continued };
  };

  assert.equal(authorize({ id: "customer-a", status: "ACTIVE", activePortal: "CUSTOMER" }).continued, true);
  assert.equal(authorize({ id: "cook-a", status: "ACTIVE", activePortal: "COOK", cookProfile: { verificationStatus: "APPROVED" } }).continued, true);
  assert.equal(authorize({ id: "cook-a", status: "ACTIVE", activePortal: "COOK", cookProfile: { verificationStatus: "PENDING" } }).error.statusCode, 403);
  assert.equal(authorize({ id: "agent-a", status: "ACTIVE", activePortal: "DELIVERY_AGENT", deliveryAgent: { verificationStatus: "APPROVED" } }).continued, true);
  assert.equal(authorize({ id: "agent-a", status: "ACTIVE", activePortal: "DELIVERY_AGENT", deliveryAgent: { verificationStatus: "REJECTED" } }).error.statusCode, 403);
  assert.equal(authorize({ id: "admin-a", status: "ACTIVE", activePortal: "ADMIN" }).error.statusCode, 403);
  assert.equal(authorize(null).error.statusCode, 401);
});

test("notification pagination validates defaults and bounds", () => {
  assert.deepEqual(notificationListSchema.query.parse({}), { page: 1, limit: 20 });
  assert.deepEqual(notificationListSchema.query.parse({ page: "2", limit: "50" }), { page: 2, limit: 50 });
  assert.equal(notificationListSchema.query.safeParse({ limit: "101" }).success, false);
  assert.equal(notificationListSchema.query.safeParse({ portal: "COOK" }).success, false);
  assert.equal(notificationIdSchema.params.safeParse({ id: "note-1" }).success, true);
  assert.equal(notificationIdSchema.params.safeParse({ id: "../other" }).success, false);
});

test("list is scoped to authenticated recipient and portal, with unread count independent of page", async () => {
  const calls = [];
  const database = {
    userNotification: {
      async findMany(args) { calls.push(["findMany", args]); return [{ id: "n1", isRead: false }]; },
      async count(args) { calls.push(["count", args]); return args.where.isRead === false ? 4 : 9; },
    },
  };
  const result = await createNotificationsService(database).list("user-a", "DELIVERY_AGENT", { page: 2, limit: 3 });
  assert.deepEqual(result, { items: [{ id: "n1", isRead: false }], page: 2, limit: 3, total: 9, unreadCount: 4 });
  assert.deepEqual(calls[0][1].where, { userId: "user-a", portal: "DELIVERY_AGENT" });
  assert.equal(calls[0][1].skip, 3);
  assert.equal(calls[0][1].take, 3);
  assert.deepEqual(calls[2][1].where, { userId: "user-a", portal: "DELIVERY_AGENT", isRead: false });
});

test("single-read mutation is recipient and portal scoped and repeated requests are safe", async () => {
  let row = { id: "n1", userId: "user-a", portal: "COOK", isRead: false };
  const calls = [];
  const database = { userNotification: {
    async updateMany(args) {
      calls.push(args);
      if (row?.id !== args.where.id || row?.userId !== args.where.userId || row?.portal !== args.where.portal || row?.isRead) return { count: 0 };
      row.isRead = true;
      return { count: 1 };
    },
    async findFirst(args) {
      calls.push(args);
      return row?.id === args.where.id && row?.userId === args.where.userId && row?.portal === args.where.portal ? { id: row.id } : null;
    },
  } };
  const service = createNotificationsService(database);
  assert.deepEqual(await service.markRead("user-a", "COOK", "n1"), { id: "n1", isRead: true });
  assert.deepEqual(await service.markRead("user-a", "COOK", "n1"), { id: "n1", isRead: true });
  assert.deepEqual(calls[0].where, { id: "n1", userId: "user-a", portal: "COOK", isRead: false });
  await assert.rejects(service.markRead("user-b", "COOK", "n1"), { statusCode: 404 });
  await assert.rejects(service.markRead("user-a", "CUSTOMER", "n1"), { statusCode: 404 });
});

test("mark-all updates only unread rows for this recipient and active portal", async () => {
  let args;
  const result = await createNotificationsService({ userNotification: {
    async updateMany(input) { args = input; return { count: 2 }; },
  } }).markAllRead("user-a", "CUSTOMER");
  assert.deepEqual(args, {
    where: { userId: "user-a", portal: "CUSTOMER", isRead: false },
    data: { isRead: true },
  });
  assert.deepEqual(result, { updatedCount: 2, unreadCount: 0 });
});

test("event-key creation is idempotent per recipient and portal; nullable keys remain independently creatable", async () => {
  const records = new Map();
  let creates = 0;
  const database = { userNotification: {
    async upsert({ where, create }) {
      const key = JSON.stringify(where.userId_portal_eventKey);
      if (!records.has(key)) records.set(key, { id: `event-${records.size + 1}`, ...create });
      return records.get(key);
    },
    async create({ data }) { creates += 1; return { id: `no-key-${creates}`, ...data }; },
  } };
  const service = createNotificationsService(database);
  const event = { userId: "user-a", portal: "CUSTOMER", title: "Order update", message: "Status changed", eventKey: "order:1:confirmed" };
  const first = await service.create(event);
  const retry = await service.create(event);
  assert.equal(first.id, retry.id);
  await service.create({ ...event, eventKey: null });
  await service.create({ ...event, eventKey: null });
  assert.equal(creates, 2);

  const migration = await readFile(new URL("../../prisma/migrations/20261017130000_add_user_notifications/migration.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE UNIQUE INDEX "UserNotification_userId_portal_eventKey_key" ON "UserNotification"\("userId", "portal", "eventKey"\)/);
  assert.doesNotMatch(migration, /WHERE "eventKey" IS NOT NULL/i);
});

test("notification APIs reject unauthenticated requests", async (context) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/notifications`;
  const list = await fetch(base);
  const read = await fetch(`${base}/note-1/read`, { method: "PATCH" });
  const readAll = await fetch(`${base}/read-all`, { method: "PATCH" });
  assert.equal(list.status, 401);
  assert.equal(read.status, 401);
  assert.equal(readAll.status, 401);
});
