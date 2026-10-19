import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createDeliveryWorkService } from "../modules/delivery-agent/delivery-agent.service.js";

const approvedDocuments = [
  { id: "identity", documentType: "IDENTITY_PROOF", verificationStatus: "APPROVED", createdAt: new Date("2026-01-01") },
];
const readyAgent = {
  id: "agent-1", userId: "user-1", verificationStatus: "APPROVED", isAvailable: true,
  deliveryType: "BICYCLE", vehicleType: "Bicycle",
  payoutDetails: { verificationStatus: "APPROVED", upiId: "agent@bank", accountHolderName: "Agent Name" },
  user: { status: "ACTIVE", role: "DELIVERY_AGENT", verificationDocuments: approvedDocuments },
};
const order = (overrides = {}) => ({
  id: "order-1", customerId: "customer-1", cookId: "cook-1", orderNumber: "TB-1", status: "READY_FOR_PICKUP", paymentStatus: "PENDING",
  deliveryAgentId: null, deliveryFee: "30.00", deliveryEarning: "30.00", cookName: "Kitchen",
  items: [{ id: "item-1", name: "Meal", quantity: 2, unitPrice: "50.00", totalPrice: "100.00" }],
  checkout: { paymentMethod: "COD", addressSnapshot: { recipientName: "Customer", phone: "9999999999", locality: "Katraj", city: "Pune" } },
  address: null, statusHistory: [], createdAt: new Date(), updatedAt: new Date(), ...overrides,
});
const context = () => ({
  deliveryAgent: { findUnique: async () => readyAgent },
  address: { findFirst: async () => ({ landmark: JSON.stringify({ deliveryType: "BICYCLE" }) }) },
});

test("available deliveries are unassigned pickup-ready orders and omit private address data", async () => {
  let query;
  const work = createDeliveryWorkService({ ...context(), order: { findMany: async (value) => { query = value; return [order()]; } } });
  const result = await work.listAvailable("user-1");
  assert.equal(query.where.deliveryAgentId, null);
  assert.equal(query.where.status, "READY_FOR_PICKUP");
  assert.equal(result[0].deliveryArea, "Katraj");
  assert.equal("deliveryAddress" in result[0], false);
  assert.equal("phone" in result[0], false);
});

test("claim atomically assigns the order to the authenticated ready agent", async () => {
  let update;
  let claimed = false;
  const notifications = [];
  const tx = { ...context(), order: {
    updateMany: async (query) => {
      update = query;
      if (claimed) return { count: 0 };
      claimed = true;
      return { count: 1 };
    },
    findFirst: async () => order({ deliveryAgentId: claimed ? "agent-1" : null }),
  }, userNotification: { upsert: async ({ create }) => { notifications.push(create); return create; } } };
  const database = { $transaction: async (callback) => callback(tx) };
  const result = await createDeliveryWorkService(database).claim("user-1", "order-1");
  assert.equal(update.where.deliveryAgentId, null);
  assert.equal(update.where.status, "READY_FOR_PICKUP");
  assert.equal(update.data.deliveryAgentId, "agent-1");
  assert.equal(result.deliveryAddress.phone, "9999999999");
  assert.deepEqual(notifications.map(({ userId, portal, metadata, eventKey }) => [userId, portal, metadata.kind, eventKey]), [
    ["user-1", "DELIVERY_AGENT", "DELIVERY_ASSIGNED", "order:order-1:assigned:delivery-agent:user-1"],
  ]);
  await assert.rejects(createDeliveryWorkService(database).claim("user-1", "order-1"), { statusCode: 409 });
  assert.equal(notifications.length, 1, "a repeated claim cannot create a second assignment notice");
});

test("a competing claim is rejected without assigning the order twice", async () => {
  let reads = 0;
  const database = { $transaction: async (callback) => callback({ ...context(), order: {
    updateMany: async () => ({ count: 0 }), findFirst: async () => { reads += 1; return order(); },
  } }) };
  await assert.rejects(createDeliveryWorkService(database).claim("user-1", "order-1"), { statusCode: 409 });
  assert.equal(reads, 0);
});

test("claim requires an online, fully ready delivery agent", async () => {
  const offlineDb = { ...context(), order: { updateMany: async () => assert.fail("must not write") }, $transaction: async (callback) => callback({
    ...context(), deliveryAgent: { findUnique: async () => ({ ...readyAgent, isAvailable: false }) }, order: { updateMany: async () => assert.fail("must not write") },
  }) };
  await assert.rejects(createDeliveryWorkService(offlineDb).claim("user-1", "order-1"), { statusCode: 409 });
});

test("pickup and completion use guarded transitions and write status history", async () => {
  const writes = [];
  let currentStatus = "READY_FOR_PICKUP";
  const tx = {
    ...context(),
    $queryRaw: async () => [{ available: true }],
    order: {
      findFirst: async () => order({ status: currentStatus, deliveryAgentId: "agent-1" }),
      updateMany: async ({ where, data }) => {
        writes.push({ where, data });
        if (where.status !== currentStatus) return { count: 0 };
        currentStatus = data.status;
        return { count: 1 };
      },
    },
    orderStatusHistory: { create: async ({ data }) => writes.push({ history: data }) },
    userNotification: { upsert: async ({ create }) => { writes.push({ notification: create }); return create; } },
  };
  const database = { $transaction: async (callback) => callback(tx) };
  const work = createDeliveryWorkService(database, () => new Date("2026-10-17T12:00:00Z"));
  const afterPickup = await work.transition("user-1", "order-1", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY");
  assert.equal(afterPickup.status, "OUT_FOR_DELIVERY");
  const afterDelivery = await work.transition("user-1", "order-1", "OUT_FOR_DELIVERY", "DELIVERED");
  assert.equal(afterDelivery.status, "DELIVERED");
  assert.equal(afterDelivery.paymentStatus, "PENDING", "delivery alone must not imply COD collection");
  assert.equal(writes.filter((entry) => entry.history).length, 2);
  assert.deepEqual(writes.filter((entry) => entry.notification).map(({ notification }) => [notification.userId, notification.portal, notification.metadata.kind, notification.eventKey]), [
    ["customer-1", "CUSTOMER", "ORDER_STATUS", "order:order-1:transition:READY_FOR_PICKUP:OUT_FOR_DELIVERY:customer-1"],
    ["user-1", "DELIVERY_AGENT", "DELIVERY_PICKED_UP", "order:order-1:picked-up:delivery-agent:user-1"],
    ["customer-1", "CUSTOMER", "ORDER_STATUS", "order:order-1:transition:OUT_FOR_DELIVERY:DELIVERED:customer-1"],
    ["customer-1", "CUSTOMER", "REVIEW_REQUESTED", "order:order-1:review-request:customer:customer-1"],
    ["user-1", "DELIVERY_AGENT", "DELIVERY_COMPLETED", "order:order-1:delivered:delivery-agent:user-1"],
  ]);
  await assert.rejects(work.transition("user-1", "order-1", "OUT_FOR_DELIVERY", "DELIVERED"), { statusCode: 409 });
  assert.equal(writes.filter((entry) => entry.history).length, 2);
  assert.equal(writes.filter((entry) => entry.notification).length, 5, "repeated transition creates no duplicate notices");
});

test("COD collection is an explicit guarded payment transition and retries are idempotent", async () => {
  let paymentStatus = "PENDING";
  let writes = 0;
  const notifications = [];
  const tx = {
    ...context(),
    order: {
      findFirst: async () => order({ status: "DELIVERED", paymentStatus, deliveryAgentId: "agent-1" }),
      updateMany: async ({ where, data }) => {
        assert.equal(where.deliveryAgentId, "agent-1");
        assert.equal(where.status, "DELIVERED");
        assert.equal(where.paymentStatus, "PENDING");
        writes += 1;
        if (paymentStatus !== "PENDING") return { count: 0 };
        paymentStatus = data.paymentStatus;
        return { count: 1 };
      },
    },
    userNotification: { upsert: async ({ create }) => { notifications.push(create); return create; } },
  };
  const database = { $transaction: async (callback) => callback(tx) };
  const work = createDeliveryWorkService(database);

  const collected = await work.confirmCodCollection("user-1", "order-1");
  assert.equal(collected.paymentStatus, "PAID");
  const retried = await work.confirmCodCollection("user-1", "order-1");
  assert.equal(retried.paymentStatus, "PAID");
  assert.equal(writes, 1);
  assert.deepEqual(notifications.map(({ userId, portal, metadata, eventKey }) => [userId, portal, metadata.kind, eventKey]), [
    ["user-1", "DELIVERY_AGENT", "COD_COLLECTION_RECORDED", "order:order-1:cod-collected:delivery-agent:user-1"],
  ]);
  assert.doesNotMatch(notifications[0].title + notifications[0].message, /earning|payout/i);
});

test("delivery notification failure rolls back pickup status and history in the transaction", async () => {
  const committed = { status: "READY_FOR_PICKUP", history: [], notifications: [] };
  const database = {
    $transaction: async (callback) => {
      const pending = structuredClone(committed);
      const tx = {
        ...context(),
        $queryRaw: async () => [{ available: true }],
        order: {
          findFirst: async () => order({ status: pending.status, deliveryAgentId: "agent-1" }),
          updateMany: async ({ where, data }) => {
            if (where.status !== pending.status) return { count: 0 };
            pending.status = data.status;
            return { count: 1 };
          },
        },
        orderStatusHistory: { create: async ({ data }) => { pending.history.push(data); } },
        userNotification: { upsert: async () => { throw new Error("notification persistence failed"); } },
      };
      const result = await callback(tx);
      Object.assign(committed, pending);
      return result;
    },
  };
  await assert.rejects(
    createDeliveryWorkService(database).transition("user-1", "order-1", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"),
    /notification persistence failed/,
  );
  assert.equal(committed.status, "READY_FOR_PICKUP");
  assert.deepEqual(committed.history, []);
  assert.deepEqual(committed.notifications, []);
});

test("COD collection rejects online, undelivered, and unassigned orders without payment changes", async () => {
  let paymentStatus = "PENDING";
  const databaseFor = (orderResult) => ({
    ...context(),
    order: { findFirst: async () => orderResult, updateMany: async () => assert.fail("payment must not change") },
    $transaction: async (callback) => callback({
      ...context(),
      order: { findFirst: async () => orderResult, updateMany: async () => assert.fail("payment must not change") },
    }),
  });
  await assert.rejects(
    createDeliveryWorkService(databaseFor(order({ status: "DELIVERED", deliveryAgentId: "agent-1", checkout: { paymentMethod: "ONLINE" } }))).confirmCodCollection("user-1", "order-1"),
    { statusCode: 409 },
  );
  await assert.rejects(
    createDeliveryWorkService(databaseFor(order({ status: "OUT_FOR_DELIVERY", deliveryAgentId: "agent-1" }))).confirmCodCollection("user-1", "order-1"),
    { statusCode: 409 },
  );
  await assert.rejects(
    createDeliveryWorkService(databaseFor(null)).confirmCodCollection("user-1", "other-order"),
    { statusCode: 404 },
  );
  assert.equal(paymentStatus, "PENDING");
});

test("another agent cannot transition an order not assigned to them", async () => {
  const database = { $transaction: async (callback) => callback({
    ...context(), $queryRaw: async () => [{ available: true }], order: { findFirst: async () => null, updateMany: async () => assert.fail("must not write") },
  }) };
  await assert.rejects(createDeliveryWorkService(database).transition("user-1", "other-order", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"), { statusCode: 404 });
});

test("a changed assignment is not visible to the former agent and creates no notification", async () => {
  let notificationWrites = 0;
  const database = { $transaction: async (callback) => callback({
    ...context(),
    $queryRaw: async () => [{ available: true }],
    order: {
      findFirst: async ({ where }) => where.deliveryAgentId === "agent-1" ? null : order({ deliveryAgentId: "agent-2" }),
      updateMany: async () => assert.fail("former agent must not change the order"),
    },
    orderStatusHistory: { create: async () => assert.fail("no history should be written") },
    userNotification: { upsert: async () => { notificationWrites += 1; } },
  }) };
  await assert.rejects(
    createDeliveryWorkService(database).transition("user-1", "order-1", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"),
    { statusCode: 404 },
  );
  assert.equal(notificationWrites, 0);
});

test("delivery status changes fail clearly when order-history migration is missing", async () => {
  let orderReads = 0;
  const database = { $transaction: async (callback) => callback({
    ...context(), $queryRaw: async () => [{ available: false }],
    order: { findFirst: async () => { orderReads += 1; return order(); }, updateMany: async () => assert.fail("must not write") },
  }) };
  await assert.rejects(createDeliveryWorkService(database).transition("user-1", "order-1", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"), { statusCode: 503 });
  assert.equal(orderReads, 0);
});

test("earnings report completed delivery fees as accrued and not paid out", async () => {
  const database = { ...context(), order: {
    findMany: async () => [{ id: "order-1", orderNumber: "TB-1", deliveryEarning: "12.35", updatedAt: new Date() }],
    aggregate: async () => ({ _sum: { deliveryEarning: "25.40" } }),
  } };
  const result = await createDeliveryWorkService(database).getEarnings("user-1");
  assert.equal(result.totalEarned, 25.4);
  assert.equal(result.deliveries[0].amount, 12.35);
  assert.match(result.note, /has not recorded payout settlement/);
});

test("COD collection endpoint remains protected by approved-agent authorization", async () => {
  const routes = await readFile(new URL("../modules/delivery-agent/delivery-agent.routes.js", import.meta.url), "utf8");
  assert.match(routes, /router\.post\("\/deliveries\/:id\/collect-cod", requireApprovedDeliveryAgent, validate\(orderIdSchema\), confirmCodCollection\)/);
});
