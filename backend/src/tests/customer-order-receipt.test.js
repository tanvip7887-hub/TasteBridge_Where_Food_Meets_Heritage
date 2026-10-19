import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createOrdersService } from "../modules/orders/orders.service.js";

const makeOrder = (id, customerId, overrides = {}) => ({
  id, customerId, checkoutId: "checkout-1", status: "DELIVERED", paymentStatus: "PENDING",
  cookEarning: "90.00", deliveryEarning: "30.00", customerReceivedAt: null, hiddenFromCustomerAt: null,
  ...overrides,
});

const createDatabase = (orders) => {
  const rows = structuredClone(orders);
  return {
    rows,
    order: {
      async findFirst({ where }) {
        const row = rows.find((candidate) => candidate.id === where.id && candidate.customerId === where.customerId);
        return row ? { id: row.id, status: row.status, customerReceivedAt: row.customerReceivedAt, hiddenFromCustomerAt: row.hiddenFromCustomerAt } : null;
      },
      async updateMany({ where, data }) {
        const row = rows.find((candidate) => candidate.id === where.id && candidate.customerId === where.customerId
          && candidate.status === where.status && candidate[Object.keys(data)[0]] === where[Object.keys(data)[0]]);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
};

test("customer receipt confirmation is delivered-only, owner-scoped, idempotent, and leaves COD/earnings untouched", async () => {
  const db = createDatabase([makeOrder("order-a", "customer-a"), makeOrder("order-b", "customer-a")]);
  const confirmedAt = new Date("2026-10-17T12:00:00.000Z");
  const service = createOrdersService(db, { now: () => confirmedAt });

  await assert.rejects(service.confirmOrderReceived("customer-b", "order-a"), { statusCode: 404 });
  const [first, concurrentRetry] = await Promise.all([
    service.confirmOrderReceived("customer-a", "order-a"),
    service.confirmOrderReceived("customer-a", "order-a"),
  ]);
  assert.equal(first.customerReceivedAt.toISOString(), confirmedAt.toISOString());
  assert.equal(concurrentRetry.customerReceivedAt.toISOString(), confirmedAt.toISOString());
  assert.equal(db.rows.find(({ id }) => id === "order-a").paymentStatus, "PENDING");
  assert.equal(db.rows.find(({ id }) => id === "order-a").cookEarning, "90.00");
  assert.equal(db.rows.find(({ id }) => id === "order-a").deliveryEarning, "30.00");
  assert.equal(db.rows.find(({ id }) => id === "order-b").customerReceivedAt, null, "one cook-specific order must not confirm its checkout sibling");
});

test("receipt confirmation rejects an order that is not delivered", async () => {
  const service = createOrdersService(createDatabase([makeOrder("order-a", "customer-a", { status: "OUT_FOR_DELIVERY" })]));
  await assert.rejects(service.confirmOrderReceived("customer-a", "order-a"), { statusCode: 409 });
});

test("history hiding is a delivered-only soft hide and retains the order and financial values", async () => {
  const db = createDatabase([makeOrder("order-a", "customer-a"), makeOrder("order-active", "customer-a", { status: "PREPARING" })]);
  const service = createOrdersService(db, { now: () => new Date("2026-10-17T12:00:00.000Z") });

  await assert.rejects(service.hideOrderFromHistory("customer-b", "order-a"), { statusCode: 404 });
  await assert.rejects(service.hideOrderFromHistory("customer-a", "order-active"), { statusCode: 409 });
  const hidden = await service.hideOrderFromHistory("customer-a", "order-a");
  assert.ok(hidden.hiddenFromCustomerAt instanceof Date);
  assert.equal(db.rows.length, 2, "hiding must not delete operational rows");
  assert.equal(db.rows[0].paymentStatus, "PENDING");
  assert.equal(db.rows[0].cookEarning, "90.00");
  assert.equal(db.rows[0].deliveryEarning, "30.00");
  assert.equal((await service.hideOrderFromHistory("customer-a", "order-a")).hiddenFromCustomerAt.toISOString(), hidden.hiddenFromCustomerAt.toISOString());
});

test("history hides selected cook orders but customer-owned checkout details remain accessible", async () => {
  const visibleOrder = makeOrder("order-visible", "customer-a", { hiddenFromCustomerAt: null });
  const hiddenOrder = makeOrder("order-hidden", "customer-a", { hiddenFromCustomerAt: new Date("2026-10-17T12:00:00.000Z") });
  let legacyQuery;
  const checkout = {
    id: "checkout-1", customerId: "customer-a", idempotencyKey: "key", createdAt: new Date("2026-10-16T10:00:00Z"),
    paymentMethod: "COD", subtotal: "20.00", deliveryFee: "30.00", platformFee: "2.00", totalAmount: "52.00",
    orders: [visibleOrder, hiddenOrder],
  };
  const db = {
    checkout: {
      async findMany() { return [checkout]; },
      async findFirst({ where }) { return where.id === checkout.id && where.customerId === checkout.customerId ? checkout : null; },
    },
    order: { async findMany(query) { legacyQuery = query; return []; } },
  };
  const service = createOrdersService(db);
  const results = await service.listOrders("customer-a");
  assert.deepEqual(legacyQuery.where, { customerId: "customer-a", checkoutId: null, hiddenFromCustomerAt: null });
  assert.deepEqual(results[0].orders.map(({ id }) => id), ["order-visible"]);
  assert.equal(results[0].totalAmount, 52, "stored checkout financial total remains unchanged when one child is hidden");
  assert.deepEqual((await service.getOrder("customer-a", checkout.id)).orders.map(({ id }) => id), ["order-visible", "order-hidden"]);
});

test("customer order endpoints validate IDs and require the existing customer portal guard", async () => {
  const routes = await readFile(new URL("../modules/orders/orders.routes.js", import.meta.url), "utf8");
  const controller = await readFile(new URL("../modules/orders/orders.controller.js", import.meta.url), "utf8");
  assert.match(routes, /router\.post\("\/:id\/receipt-confirmation", validate\(orderIdSchema\), confirmCustomerOrderReceived\)/);
  assert.match(routes, /router\.post\("\/:id\/hide", validate\(orderIdSchema\), hideCustomerOrderFromHistory\)/);
  assert.match(routes, /router\.use\(authenticate, requireCustomerOrderAccess\)/);
  assert.match(controller, /confirmOrderReceived\(req\.user\.id, req\.params\.id\)/);
  assert.match(controller, /hideOrderFromHistory\(req\.user\.id, req\.params\.id\)/);
});
