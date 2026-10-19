import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createCookOrdersService } from "../modules/cook/cook-orders.service.js";

const clone = (value) => structuredClone(value);

const makeOrder = (id, cookId, overrides = {}) => ({
  id,
  cookId,
  customerId: "customer-1",
  orderNumber: `TB-${id}`,
  checkoutId: "checkout-1",
  status: "PENDING",
  paymentStatus: "PENDING",
  paymentMethod: "COD",
  totalAmount: "25.50",
  subtotal: "20.00",
  deliveryFee: "3.00",
  platformFee: "2.50",
  createdAt: new Date("2026-10-16T10:00:00Z"),
  checkout: { id: "checkout-1", paymentMethod: "COD", addressSnapshot: { recipientName: "Asha" } },
  address: null,
  items: [{ id: `item-${id}`, name: "Poha", quantity: 2, unitPrice: "10.00", totalPrice: "20.00", dishId: "dish-1" }],
  ...overrides,
});

const createDatabase = ({ orders = [makeOrder("order-a", "cook-a")], failSerialization = false } = {}) => {
  const state = { orders: clone(orders), stock: { "dish-1": 0, "dish-2": 0 }, updates: 0, history: [], readyAvailable: true, notifications: [] };
  const makeClient = (target) => ({
    async $queryRaw() { return [{ available: target.readyAvailable }]; },
    cookProfile: { async findUnique({ where }) { return { userId: `cook-user-${where.id}` }; } },
    userNotification: { async upsert({ where, create }) {
      const key = `${where.userId_portal_eventKey.userId}|${where.userId_portal_eventKey.portal}|${where.userId_portal_eventKey.eventKey}`;
      let row = target.notifications.find((item) => item.key === key);
      if (!row) { row = { key, ...clone(create) }; target.notifications.push(row); }
      return row;
    } },
    orderStatusHistory: {
      async create({ data }) {
        const row = { id: `history-${target.history.length + 1}`, changedAt: new Date(), ...clone(data) };
        target.history.push(row);
        return clone(row);
      },
    },
    order: {
      async findMany({ where }) {
        return target.orders.filter((order) => Object.entries(where || {}).every(([key, value]) => order[key] === value))
          .map((order) => ({ ...clone(order), statusHistory: clone(target.history.filter((event) => event.orderId === order.id)) }));
      },
      async findFirst({ where }) {
        const found = target.orders.find((order) => Object.entries(where || {}).every(([key, value]) => order[key] === value));
        return found ? { ...clone(found), statusHistory: clone(target.history.filter((event) => event.orderId === found.id)) } : null;
      },
      async findUnique({ where }) {
        const found = target.orders.find((order) => order.id === where.id);
        return found ? clone(found) : null;
      },
      async updateMany({ where, data }) {
        target.updates += 1;
        const order = target.orders.find((row) => Object.entries(where).every(([key, value]) => row[key] === value));
        if (!order) return { count: 0 };
        Object.assign(order, clone(data));
        return { count: 1 };
      },
    },
    dish: {
      async update({ where, data }) {
        target.stock[where.id] += data.availableQuantity.increment;
        return { id: where.id, availableQuantity: target.stock[where.id] };
      },
    },
  });
  const database = makeClient(state);
  database.$transaction = async (callback) => {
    if (failSerialization) {
      const error = new Error("simulated serialization race");
      error.code = "P2034";
      throw error;
    }
    const draft = clone(state);
    const result = await callback(makeClient(draft));
    Object.assign(state, draft);
    return result;
  };
  Object.defineProperty(database, "state", { get: () => state });
  return database;
};

test("cook order list is scoped to that cook and returns item and fulfillment snapshots", async () => {
  const database = createDatabase({ orders: [makeOrder("a", "cook-a"), makeOrder("b", "cook-b")] });
  let query;
  const original = database.order.findMany;
  database.order.findMany = async (args) => { query = args; return original(args); };
  const items = await createCookOrdersService(database).listOrders("cook-a");
  assert.deepEqual(query.where, { cookId: "cook-a" });
  assert.deepEqual(items.map((order) => order.id), ["a"]);
  assert.equal(items[0].items[0].name, "Poha");
  assert.equal(items[0].checkout.addressSnapshot.recipientName, "Asha");
});

test("cook can accept pending COD and mock-paid orders without changing payment or money fields", async () => {
  for (const [paymentStatus, paymentMethod] of [["PENDING", "COD"], ["PAID", "ONLINE"]]) {
    const database = createDatabase({ orders: [makeOrder("order-a", "cook-a", { paymentStatus, checkout: { paymentMethod } })] });
    const before = { ...database.state.orders[0] };
    const accepted = await createCookOrdersService(database).acceptOrder("cook-a", "order-a");
    assert.equal(accepted.status, "CONFIRMED");
    assert.equal(database.state.orders[0].paymentStatus, paymentStatus);
    for (const field of ["totalAmount", "subtotal", "deliveryFee", "platformFee", "checkoutId"]) {
      assert.equal(database.state.orders[0][field], before[field], `${field} must remain unchanged`);
    }
  }
});

test("cook cannot access or transition another cook's order", async () => {
  const database = createDatabase();
  const service = createCookOrdersService(database);
  await assert.rejects(service.acceptOrder("cook-b", "order-a"), { statusCode: 404 });
  await assert.rejects(service.rejectOrder("cook-b", "order-a"), { statusCode: 404 });
  assert.equal(database.state.orders[0].status, "PENDING");
  assert.equal(database.state.updates, 0);
});

test("accept is idempotent after confirmation and invalid transitions do not update the order", async () => {
  const database = createDatabase();
  const service = createCookOrdersService(database);
  await service.acceptOrder("cook-a", "order-a");
  const updatesAfterAccept = database.state.updates;
  await service.acceptOrder("cook-a", "order-a");
  assert.equal(database.state.updates, updatesAfterAccept);
  database.state.orders[0].status = "PREPARING";
  await assert.rejects(service.acceptOrder("cook-a", "order-a"), { statusCode: 409 });
  assert.equal(database.state.orders[0].status, "PREPARING");
});

test("cook completes pending to confirmed to preparing to ready and records each transition once", async () => {
  const database = createDatabase();
  const service = createCookOrdersService(database);
  assert.equal((await service.acceptOrder("cook-a", "order-a")).status, "CONFIRMED");
  assert.equal((await service.prepareOrder("cook-a", "order-a")).status, "PREPARING");
  assert.equal((await service.markReadyForPickup("cook-a", "order-a")).status, "READY_FOR_PICKUP");
  await service.prepareOrder("cook-a", "order-a").then(
    () => assert.fail("ready orders cannot be moved backwards"),
    (error) => assert.equal(error.statusCode, 409)
  );
  assert.deepEqual(database.state.history.map(({ fromStatus, toStatus }) => [fromStatus, toStatus]), [
    ["PENDING", "CONFIRMED"], ["CONFIRMED", "PREPARING"], ["PREPARING", "READY_FOR_PICKUP"],
  ]);
  assert.deepEqual((await service.listOrders("cook-a"))[0].statusHistory.map(({ toStatus }) => toStatus), [
    "CONFIRMED", "PREPARING", "READY_FOR_PICKUP",
  ]);
  assert.equal(database.state.orders[0].paymentStatus, "PENDING");
  assert.deepEqual(database.state.notifications.map(({ userId, portal, metadata }) => [userId, portal, metadata.toStatus]), [
    ["customer-1", "CUSTOMER", "CONFIRMED"],
    ["customer-1", "CUSTOMER", "PREPARING"],
    ["customer-1", "CUSTOMER", "READY_FOR_PICKUP"],
  ]);
  const cookAcceptance = database.state.notifications.find(({ metadata }) => metadata.toStatus === "CONFIRMED");
  assert.equal(cookAcceptance.title, "Order accepted");
  assert.equal(cookAcceptance.message, "Order TB-order-a: The cook accepted your order.");
  assert.ok(database.state.notifications.every(({ portal }) => portal === "CUSTOMER"), "cook-initiated transitions do not notify the cook about its own actions");
});

test("ready transition fails closed when the database has not applied the enum migration", async () => {
  const database = createDatabase();
  database.state.orders[0].status = "PREPARING";
  database.state.readyAvailable = false;
  await assert.rejects(createCookOrdersService(database).markReadyForPickup("cook-a", "order-a"), { statusCode: 503 });
  assert.equal(database.state.orders[0].status, "PREPARING");
  assert.deepEqual(database.state.history, []);
});

test("cook preparation and ready actions enforce ownership, legal sequence, and idempotence", async () => {
  const database = createDatabase();
  const service = createCookOrdersService(database);
  await assert.rejects(service.prepareOrder("cook-a", "order-a"), { statusCode: 409 });
  await assert.rejects(service.markReadyForPickup("cook-b", "order-a"), { statusCode: 404 });
  await service.acceptOrder("cook-a", "order-a");
  await service.prepareOrder("cook-a", "order-a");
  const historyCount = database.state.history.length;
  await service.prepareOrder("cook-a", "order-a");
  assert.equal(database.state.history.length, historyCount);
  assert.equal(database.state.orders[0].status, "PREPARING");
});

test("paid mock orders cannot be rejected and no checkout, payment, or stock state changes", async () => {
  const database = createDatabase({ orders: [makeOrder("order-a", "cook-a", { paymentStatus: "PAID", checkout: { paymentMethod: "ONLINE" } })] });
  const before = clone(database.state.orders);
  await assert.rejects(createCookOrdersService(database).rejectOrder("cook-a", "order-a"), { statusCode: 409 });
  assert.deepEqual(database.state.orders, before);
  assert.deepEqual(database.state.stock, { "dish-1": 0, "dish-2": 0 });
  assert.equal(database.state.updates, 0);
});

test("rejecting one eligible COD order cancels the complete cook group and restores stock once", async () => {
  const database = createDatabase({ orders: [
    makeOrder("order-a", "cook-a", { items: [{ dishId: "dish-1", quantity: 2 }] }),
    makeOrder("order-b", "cook-b", { status: "CONFIRMED", items: [{ dishId: "dish-2", quantity: 1 }] }),
  ] });
  const service = createCookOrdersService(database);
  await service.rejectOrder("cook-a", "order-a");
  assert.deepEqual(database.state.orders.map((order) => order.status), ["CANCELLED", "CANCELLED"]);
  assert.deepEqual(database.state.stock, { "dish-1": 2, "dish-2": 1 });
  assert.deepEqual(database.state.notifications.map(({ userId, portal, metadata }) => [userId, portal, metadata.orderId]), [
    ["customer-1", "CUSTOMER", "order-a"],
    ["customer-1", "CUSTOMER", "order-b"],
    ["cook-user-cook-b", "COOK", "order-b"],
  ]);
  await service.rejectOrder("cook-a", "order-a");
  assert.deepEqual(database.state.stock, { "dish-1": 2, "dish-2": 1 });
  assert.equal(database.state.notifications.length, 3, "repeated group rejection does not duplicate notifications");
});

test("COD rejection refuses a partially ineligible group without restoring stock", async () => {
  const database = createDatabase({ orders: [
    makeOrder("order-a", "cook-a", { items: [{ dishId: "dish-1", quantity: 2 }] }),
    makeOrder("order-b", "cook-b", { status: "OUT_FOR_DELIVERY", items: [{ dishId: "dish-2", quantity: 1 }] }),
  ] });
  await assert.rejects(createCookOrdersService(database).rejectOrder("cook-a", "order-a"), { statusCode: 409 });
  assert.deepEqual(database.state.orders.map((order) => order.status), ["PENDING", "OUT_FOR_DELIVERY"]);
  assert.deepEqual(database.state.stock, { "dish-1": 0, "dish-2": 0 });
  assert.equal(database.state.updates, 0);
});

test("serialization retry recognizes a concurrent accept or full COD cancellation without duplicate effects", async () => {
  const acceptedDatabase = createDatabase({ orders: [makeOrder("order-a", "cook-a", { status: "CONFIRMED" })], failSerialization: true });
  assert.equal((await createCookOrdersService(acceptedDatabase).acceptOrder("cook-a", "order-a")).status, "CONFIRMED");

  const cancelledDatabase = createDatabase({ orders: [makeOrder("order-a", "cook-a", { status: "CANCELLED" }), makeOrder("order-b", "cook-b", { status: "CANCELLED" })], failSerialization: true });
  assert.equal((await createCookOrdersService(cancelledDatabase).rejectOrder("cook-a", "order-a")).status, "CANCELLED");
  assert.deepEqual(cancelledDatabase.state.stock, { "dish-1": 0, "dish-2": 0 });
});

test("cook routes authenticate and require an approved cook for list and status actions", async () => {
  const source = await readFile(new URL("../modules/cook/cook.routes.js", import.meta.url), "utf8");
  assert.match(source, /router\.use\(authenticate\)/);
  assert.match(source, /router\.get\("\/orders", requireApprovedCook, getMyCookOrders\)/);
  assert.match(source, /router\.patch\("\/orders\/:id\/accept", requireApprovedCook, validate\(orderIdSchema\), acceptMyCookOrder\)/);
  assert.match(source, /router\.patch\("\/orders\/:id\/prepare", requireApprovedCook, validate\(orderIdSchema\), prepareMyCookOrder\)/);
  assert.match(source, /router\.patch\("\/orders\/:id\/ready", requireApprovedCook, validate\(orderIdSchema\), markMyCookOrderReady\)/);
  assert.match(source, /router\.patch\("\/orders\/:id\/reject", requireApprovedCook, validate\(orderIdSchema\), rejectMyCookOrder\)/);
});
