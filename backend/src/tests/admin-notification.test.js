import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOrderStatusTransition,
  cancelCheckoutOrders,
  persistMarkAllPlatformNotificationsAsRead,
  updateOrderStatusWithDatabase,
} from "../modules/admin/admin.service.js";
import { updateOrderStatusSchema } from "../modules/admin/admin.validation.js";
import { requireRole } from "../middlewares/auth.js";

test("mark all platform notifications as read updates only unread records", async () => {
  let received;
  const database = {
    platformNotification: {
      updateMany: async (args) => {
        received = args;
        return { count: 3 };
      },
    },
  };

  const result = await persistMarkAllPlatformNotificationsAsRead(database);
  assert.deepEqual(received, { where: { isRead: false }, data: { isRead: true } });
  assert.equal(result.count, 3);
});

test("admin cancellation keeps an eligible COD checkout group together and restores stock once", async () => {
  const orders = [
    { id: "order-a", customerId: "customer-1", cookId: "cook-a", orderNumber: "TB-a", status: "PENDING", paymentStatus: "PENDING", items: [{ dishId: "dish-a", quantity: 2 }] },
    { id: "order-b", customerId: "customer-1", cookId: "cook-b", orderNumber: "TB-b", status: "PREPARING", paymentStatus: "PENDING", items: [{ dishId: "dish-b", quantity: 1 }] },
  ];
  const stock = { "dish-a": 0, "dish-b": 0 };
  const tx = {
    order: {
      async findMany({ where }) { assert.equal(where.checkoutId, "checkout-1"); return orders; },
      async updateMany({ where, data }) {
        const row = orders.find((order) => order.id === where.id && order.status === where.status);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      async findUnique({ where }) { return orders.find((order) => order.id === where.id); },
    },
    dish: { async update({ where, data }) { stock[where.id] += data.availableQuantity.increment; } },
    orderStatusHistory: { async create() {} },
    cookProfile: { async findUnique({ where }) { return { userId: `user-${where.id}` }; } },
    userNotification: { async upsert() {} },
  };
  await cancelCheckoutOrders(tx, "checkout-1", "order-a");
  assert.deepEqual(orders.map((order) => order.status), ["CANCELLED", "CANCELLED"]);
  assert.deepEqual(stock, { "dish-a": 2, "dish-b": 1 });
  await cancelCheckoutOrders(tx, "checkout-1", "order-a");
  assert.deepEqual(stock, { "dish-a": 2, "dish-b": 1 });
});

test("repeated admin cancellation is idempotent for an already cancelled order", async () => {
  const row = { id: "order-a", status: "CANCELLED", paymentStatus: "PENDING", checkoutId: null };
  let updates = 0;
  const database = {
    async $transaction(callback) {
      return callback({
        order: {
          async findUnique() { return { ...row }; },
          async updateMany() { updates += 1; return { count: 1 }; },
        },
        orderStatusHistory: { async create() {} },
      });
    },
  };
  const result = await updateOrderStatusWithDatabase(database, "order-a", { status: "CANCELLED" });
  assert.equal(result.status, "CANCELLED");
  assert.equal(updates, 0);
});

test("generic admin order update accepts only a valid status transition", async () => {
  assert.equal(updateOrderStatusSchema.body.safeParse({ status: "CONFIRMED" }).success, true);
  assert.equal(updateOrderStatusSchema.body.safeParse({ status: "READY_FOR_PICKUP" }).success, true);
  assert.equal(updateOrderStatusSchema.body.safeParse({ status: "CONFIRMED", paymentStatus: "PAID" }).success, false);
  assert.equal(updateOrderStatusSchema.body.safeParse({ paymentStatus: "FAILED" }).success, false);
  assert.throws(() => assertOrderStatusTransition("PENDING", "DELIVERED"), { statusCode: 409 });
  assert.throws(() => assertOrderStatusTransition("CONFIRMED", "READY_FOR_PICKUP"), { statusCode: 409 });
  assert.throws(() => assertOrderStatusTransition("PREPARING", "OUT_FOR_DELIVERY"), { statusCode: 409 });
  assert.doesNotThrow(() => assertOrderStatusTransition("PREPARING", "READY_FOR_PICKUP"));
  assert.doesNotThrow(() => assertOrderStatusTransition("READY_FOR_PICKUP", "OUT_FOR_DELIVERY"));

  const row = { id: "order-a", customerId: "customer-a", cookId: "cook-a", orderNumber: "TB-a", status: "PENDING", paymentStatus: "PENDING", checkoutId: null };
  const notifications = [];
  const database = {
    async $transaction(callback) {
      return callback({
        order: {
          async findUnique() { return { ...row }; },
          async updateMany({ where, data }) {
            if (row.status !== where.status) return { count: 0 };
            Object.assign(row, data);
            return { count: 1 };
          },
        },
        orderStatusHistory: { async create() {} },
        cookProfile: { async findUnique({ where }) { return { userId: `user-${where.id}` }; } },
        userNotification: { async upsert({ create }) { notifications.push(create); } },
      });
    },
  };
  const updated = await updateOrderStatusWithDatabase(database, "order-a", { status: "CONFIRMED" });
  assert.equal(row.status, "CONFIRMED");
  assert.equal(row.paymentStatus, "PENDING");
  assert.equal(updated.status, "CONFIRMED");
  const customerConfirmation = notifications.find(({ userId, portal, metadata }) =>
    userId === "customer-a" && portal === "CUSTOMER" && metadata.toStatus === "CONFIRMED");
  assert.equal(customerConfirmation.title, "Order confirmed");
  assert.equal(customerConfirmation.message, "Order TB-a: TasteBridge support confirmed your order.");
  await assert.rejects(updateOrderStatusWithDatabase(database, "order-a", { status: "DELIVERED" }), { statusCode: 409 });
  await assert.rejects(updateOrderStatusWithDatabase(database, "order-a", { status: "PREPARING", paymentStatus: "PAID" }), { statusCode: 400 });
  assert.equal(row.paymentStatus, "PENDING");
  row.paymentStatus = "PAID";
  await assert.rejects(updateOrderStatusWithDatabase(database, "order-a", { status: "CANCELLED" }), { statusCode: 409 });
  assert.equal(row.status, "CONFIRMED");
});

test("admin order operations remain restricted to authenticated ADMIN users", () => {
  const guard = requireRole("ADMIN");
  let unauthorized;
  guard({ user: null }, {}, (error) => { unauthorized = error; });
  assert.equal(unauthorized.statusCode, 401);
  let forbidden;
  guard({ user: { role: "CUSTOMER" } }, {}, (error) => { forbidden = error; });
  assert.equal(forbidden.statusCode, 403);
  let allowed = false;
  guard({ user: { role: "ADMIN" } }, {}, (error) => { allowed = !error; });
  assert.equal(allowed, true);
});

test("admin refuses partial or paid checkout cancellation without restoring stock", async () => {
  for (const sibling of [
    { id: "order-b", status: "DELIVERED", paymentStatus: "PENDING" },
    { id: "order-b", status: "PENDING", paymentStatus: "PAID" },
    { id: "order-b", status: "CANCELLED", paymentStatus: "PENDING" },
  ]) {
    const orders = [
      { id: "order-a", status: "PENDING", paymentStatus: "PENDING", items: [{ dishId: "dish-a", quantity: 2 }] },
      { ...sibling, items: [{ dishId: "dish-b", quantity: 1 }] },
    ];
    let restored = 0;
    const tx = {
      order: {
        async findMany() { return orders; },
        async findUnique() { return orders[0]; },
        async updateMany() { throw new Error("must not update a partially eligible group"); },
      },
      dish: { async update() { restored += 1; } },
    };
    await assert.rejects(cancelCheckoutOrders(tx, "checkout-1", "order-a"), { statusCode: 409 });
    assert.deepEqual(orders.map((order) => order.status), ["PENDING", sibling.status]);
    assert.equal(restored, 0);
  }
});
