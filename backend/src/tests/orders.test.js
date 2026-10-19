import assert from "node:assert/strict";
import test from "node:test";
import { createOrdersService } from "../modules/orders/orders.service.js";
import { checkoutSummarySchema, orderIdSchema, placeOrderSchema } from "../modules/orders/orders.validation.js";

const validAddress = (id, userId, overrides = {}) => ({
  id, userId, label: "Home", recipientName: "Asha Rao", phone: "+919876543210",
  addressLine1: "Flat 2, Lake View", addressLine2: null, locality: "Aundh",
  city: "Pune", state: "Maharashtra", pincode: "411007", landmark: null,
  isDefault: true, ...overrides,
});

const readyCook = (id) => ({
  id, businessName: `Kitchen ${id}`, bio: "Traditional home cooking made fresh every day.",
  experienceYears: "5 years", specialization: "Idli", cuisines: ["South Indian"],
  dietaryPreferences: ["Vegetarian"], city: "Pune", locality: "Aundh",
  cookingCapacity: "20 meals", availableDays: ["Monday"], availableMealSlots: ["Lunch"],
  prepTimeNotice: "Same day", isHomeKitchenDeclared: true, foodSafetyConsent: true,
  verificationStatus: "APPROVED", fssaiStatus: "APPROVED",
  fssaiExpiryDate: new Date("2027-12-31T23:59:59.999Z"), isApprovedToSell: true,
  isOpen: true, user: { role: "COOK", status: "ACTIVE" },
});

const makeDish = (id, cookId, overrides = {}) => ({
  id, cookId, name: `Dish ${id}`, description: "Freshly prepared", cuisine: "Pune",
  price: 10, image: `https://images.example/${id}.jpg`, status: "PUBLISHED",
  isAvailable: true, availableQuantity: 8,
  category: { id: "category-1", name: "Meals", isActive: true },
  cook: readyCook(cookId), ...overrides,
});

const createDatabase = ({ cartItems = null, dishes = null, addresses = null, failOrderAt = 0, failStockRelease = false, failNotification = false, orders = [] } = {}) => {
  let state = {
    cart: { id: "cart-1", customerId: "customer-1" },
    cartItems: cartItems || [
      { id: "item-1", cartId: "cart-1", dishId: "dish-1", quantity: 2, createdAt: new Date("2026-10-15T00:00:00Z") },
      { id: "item-2", cartId: "cart-1", dishId: "dish-2", quantity: 1, createdAt: new Date("2026-10-15T00:00:01Z") },
    ],
    dishes: dishes || [makeDish("dish-1", "cook-1", { price: 12.25 }), makeDish("dish-2", "cook-2", { price: 20 })],
    addresses: addresses || [validAddress("address-1", "customer-1")],
    checkouts: [], orders, orderCreates: 0, orderStatusHistory: [], notifications: [],
  };

  const clientFor = (target) => ({
    async $queryRaw() { return [...new Set(target.dishes.map((dish) => dish.cookId))].map((id) => ({ id })); },
    cookProfile: { async findUnique({ where }) { return { userId: `cook-user-${where.id}` }; } },
    userNotification: {
      async upsert({ where, create }) {
        if (failNotification) throw new Error("simulated notification insert failure");
        const key = `${where.userId_portal_eventKey.userId}|${where.userId_portal_eventKey.portal}|${where.userId_portal_eventKey.eventKey}`;
        let row = target.notifications.find((item) => item.key === key);
        if (!row) { row = { key, ...structuredClone(create) }; target.notifications.push(row); }
        return row;
      },
    },
    cart: {
      async findUnique({ where }) {
        if (where.customerId !== target.cart?.customerId) return null;
        return {
          ...target.cart,
          items: target.cartItems.filter((item) => item.cartId === target.cart.id).map((item) => ({
            ...item, dish: target.dishes.find((dish) => dish.id === item.dishId) || null,
          })),
        };
      },
    },
    address: {
      async findMany({ where, orderBy } = {}) {
        let items = target.addresses.filter((address) => !where || address.userId === where.userId);
        if (orderBy?.[0]?.isDefault) items = [...items].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
        return structuredClone(items);
      },
    },
    platformSettings: { async findUnique() { return { id: "default", platformFeePercent: 10, deliveryFeeBase: 30 }; } },
    checkout: {
      async findFirst({ where }) {
        const found = target.checkouts.find((checkout) => Object.entries(where).every(([key, value]) => checkout[key] === value));
        return found ? hydrateCheckout(target, found) : null;
      },
      async findMany({ where }) { return target.checkouts.filter((checkout) => checkout.customerId === where.customerId).map((checkout) => hydrateCheckout(target, checkout)); },
      async create({ data }) {
        const row = { id: `checkout-${target.checkouts.length + 1}`, ...structuredClone(data), createdAt: new Date("2026-10-15T12:00:00Z") };
        target.checkouts.push(row);
        return row;
      },
    },
    dish: {
      async updateMany({ where, data }) {
        const dish = target.dishes.find((row) => row.id === where.id && row.status === where.status && row.isAvailable === where.isAvailable && row.availableQuantity >= where.availableQuantity.gte);
        if (!dish) return { count: 0 };
        dish.availableQuantity -= data.availableQuantity.decrement;
        return { count: 1 };
      },
      async update({ where, data }) {
        if (failStockRelease) throw new Error("simulated stock release failure");
        const dish = target.dishes.find((row) => row.id === where.id);
        if (!dish) throw new Error("dish not found");
        dish.availableQuantity += data.availableQuantity.increment;
        return dish;
      },
    },
    order: {
      async findMany({ where }) { return target.orders.filter((order) => order.customerId === where.customerId && order.checkoutId === where.checkoutId); },
      async findFirst({ where }) { return target.orders.find((order) => order.id === where.id && order.customerId === where.customerId && order.checkoutId === where.checkoutId) || null; },
      async create({ data }) {
        target.orderCreates += 1;
        if (failOrderAt && target.orderCreates === failOrderAt) throw new Error("simulated order insert failure");
        const { items, ...orderData } = data;
        const order = { id: `order-${target.orders.length + 1}`, ...structuredClone(orderData), items: items.create.map((item, index) => ({ id: `order-item-${target.orders.length + 1}-${index + 1}`, ...structuredClone(item) })) };
        target.orders.push(order);
        return order;
      },
      async updateMany({ where, data }) {
        const order = target.orders.find((row) => row.id === where.id && row.checkoutId === where.checkoutId && row.status === where.status);
        if (!order) return { count: 0 };
        Object.assign(order, structuredClone(data));
        return { count: 1 };
      },
    },
    orderStatusHistory: {
      async create({ data }) {
        const event = { id: `event-${target.orderStatusHistory.length + 1}`, changedAt: new Date(placedAt), ...structuredClone(data) };
        target.orderStatusHistory.push(event);
        return event;
      },
    },
    cartItem: {
      async deleteMany({ where }) {
        const before = target.cartItems.length;
        target.cartItems = target.cartItems.filter((item) => item.cartId !== where.cartId);
        return { count: before - target.cartItems.length };
      },
    },
  });

  const hydrateCheckout = (target, checkout) => ({
    ...structuredClone(checkout),
    orders: target.orders.filter((order) => order.checkoutId === checkout.id).map((order) => ({
      ...structuredClone(order),
      statusHistory: target.orderStatusHistory.filter((event) => event.orderId === order.id),
      cook: { id: order.cookId, businessName: order.cookName },
    })),
  });

  const db = clientFor(state);
  db.$transaction = async (callback) => {
    const draft = structuredClone(state);
    const result = await callback(clientFor(draft));
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, draft);
    return result;
  };
  Object.defineProperty(db, "state", { get: () => state });
  return db;
};

const key = "cb1b4600-b529-4797-88c2-9554eab86e85";
const placedAt = new Date("2026-10-15T12:00:00Z");
const at = (minutes, seconds = 0) => new Date(placedAt.getTime() + minutes * 60_000 + seconds * 1000);
const place = (service, customerId = "customer-1", idempotencyKey = key) => service.placeOrder(customerId, { addressId: "address-1", idempotencyKey, paymentMethod: "COD" });

test("checkout validation accepts only an owned address identifier and UUID retry key", () => {
  assert.equal(checkoutSummarySchema.query.safeParse({ addressId: "address-1" }).success, true);
  assert.equal(placeOrderSchema.body.safeParse({ addressId: "address-1", idempotencyKey: key, paymentMethod: "COD" }).success, true);
  assert.equal(placeOrderSchema.body.safeParse({ addressId: "address-1", idempotencyKey: key }).success, false);
  assert.equal(placeOrderSchema.body.safeParse({ addressId: "address-1", idempotencyKey: key, paymentMethod: "ONLINE" }).success, false);
  assert.equal(placeOrderSchema.body.safeParse({ addressId: "address-1", idempotencyKey: key, total: 1 }).success, false);
  assert.equal(orderIdSchema.params.safeParse({ id: "checkout-1" }).success, true);
});

test("summary recalculates current database prices, fees, and per-cook order splits", async () => {
  const service = createOrdersService(createDatabase());
  const summary = await service.getCheckoutSummary("customer-1");
  assert.equal(summary.canPlaceOrder, true);
  assert.equal(summary.totals.subtotal, 44.5);
  assert.equal(summary.totals.deliveryFee, 60);
  assert.equal(summary.totals.platformFee, 4.45);
  assert.equal(summary.totals.totalAmount, 108.95);
  assert.equal(summary.orderSplits.length, 2);
  assert.equal(summary.selectedAddressId, "address-1");
});

test("placing a multi-cook order snapshots current prices and address, reserves stock, and clears cart", async () => {
  const db = createDatabase();
  const checkout = await place(createOrdersService(db), "customer-1");
  assert.equal(checkout.orders.length, 2);
  assert.equal(checkout.totalAmount, 108.95);
  assert.equal(db.state.checkouts[0].totalAmount, "108.95");
  assert.equal(typeof db.state.checkouts[0].totalAmount, "string", "database writes use exact decimal strings");
  assert.equal(db.state.orders[0].subtotal, "24.50");
  assert.equal(db.state.orders[0].items[0].unitPrice, "12.25");
  assert.equal(checkout.orders[0].paymentStatus, "PENDING");
  assert.equal(checkout.paymentMethod, "COD");
  assert.equal(checkout.orders[0].status, "PENDING");
  assert.equal(checkout.orders[0].statusHistory[0].toStatus, "PENDING");
  assert.equal(db.state.orderStatusHistory.length, 2, "every cook-specific order gets its own initial tracking event");
  assert.deepEqual(db.state.notifications.map(({ userId, portal, metadata }) => [userId, portal, metadata.kind]), [
    ["cook-user-cook-1", "COOK", "ORDER_CREATED"],
    ["cook-user-cook-2", "COOK", "ORDER_CREATED"],
    ["customer-1", "CUSTOMER", "CHECKOUT_PLACED"],
  ]);
  assert.deepEqual(db.state.notifications.filter((item) => item.portal === "COOK").map(({ userId, metadata }) => [userId, metadata.orderId]), [
    ["cook-user-cook-1", "order-1"], ["cook-user-cook-2", "order-2"],
  ]);
  assert.equal(db.state.notifications.some((item) => item.userId === "customer-2" || item.userId === "cook-user-unrelated"), false);
  assert.ok(db.state.notifications[0].message.includes(db.state.orders[0].orderNumber));
  assert.ok(!db.state.notifications[0].message.includes(db.state.orders[1].orderNumber));
  assert.equal(checkout.orders[0].items[0].unitPrice, 12.25);
  assert.equal(checkout.orders[0].items[0].dishImage, "https://images.example/dish-1.jpg");
  assert.equal(checkout.addressSnapshot.recipientName, "Asha Rao");
  assert.equal(db.state.dishes.find((dish) => dish.id === "dish-1").availableQuantity, 6);
  assert.equal(db.state.cartItems.length, 0);
  assert.equal((await createOrdersService(db).listOrders("customer-1")).length, 1);
});

test("platform fee rounds half-up per cook and persisted totals keep paise precision", async () => {
  const db = createDatabase({
    cartItems: [{ id: "item-1", cartId: "cart-1", dishId: "dish-1", quantity: 1 }],
    dishes: [makeDish("dish-1", "cook-1", { price: "0.05" })],
  });
  const checkout = await place(createOrdersService(db));
  assert.equal(checkout.subtotal, 0.05);
  assert.equal(checkout.platformFee, 0.01, "0.05 at 10% is half-up rounded to one paise");
  assert.equal(checkout.totalAmount, 30.06);
  assert.equal(db.state.checkouts[0].platformFee, "0.01");
  assert.equal(db.state.orders[0].cookEarning, "0.04");
  assert.equal(db.state.orders[0].items[0].totalPrice, "0.05");
});

test("empty carts, unavailable dishes, insufficient stock, and another customer's address are rejected", async () => {
  const empty = createDatabase({ cartItems: [] });
  await assert.rejects(place(createOrdersService(empty)), { statusCode: 400 });

  const closedKitchen = createDatabase({ dishes: [makeDish("dish-1", "cook-1", { cook: { ...readyCook("cook-1"), isOpen: false } })] });
  await assert.rejects(place(createOrdersService(closedKitchen)), { statusCode: 409 });

  const lowStock = createDatabase({ dishes: [makeDish("dish-1", "cook-1", { availableQuantity: 1 })] });
  await assert.rejects(place(createOrdersService(lowStock)), { statusCode: 409 });

  const invalidQuantity = createDatabase({ cartItems: [{ id: "item-1", cartId: "cart-1", dishId: "dish-1", quantity: 0 }] });
  await assert.rejects(place(createOrdersService(invalidQuantity)), { statusCode: 409 });

  const foreignAddress = createDatabase({ addresses: [validAddress("address-other", "customer-2")] });
  await assert.rejects(createOrdersService(foreignAddress).placeOrder("customer-1", { addressId: "address-other", idempotencyKey: key, paymentMethod: "COD" }), { statusCode: 404 });
});

test("order creation failure rolls back every split, stock reservation, and cart deletion", async () => {
  const db = createDatabase({ failOrderAt: 2 });
  const beforeQuantities = db.state.dishes.map((dish) => dish.availableQuantity);
  await assert.rejects(place(createOrdersService(db)), /simulated order insert failure/);
  assert.equal(db.state.checkouts.length, 0);
  assert.equal(db.state.orders.length, 0);
  assert.equal(db.state.notifications.length, 0, "transaction rollback removes any notifications created before failure");
  assert.deepEqual(db.state.dishes.map((dish) => dish.availableQuantity), beforeQuantities);
  assert.equal(db.state.cartItems.length, 2);
});

test("retrying the same idempotency key returns the original checkout without charging stock twice", async () => {
  const db = createDatabase();
  const service = createOrdersService(db);
  const first = await place(service);
  const second = await place(service);
  assert.equal(second.id, first.id);
  assert.equal(db.state.orders.length, 2);
  assert.equal(db.state.dishes.find((dish) => dish.id === "dish-1").availableQuantity, 6);
  assert.equal(db.state.notifications.length, 3, "an idempotent checkout retry does not duplicate recipient events");
});

test("notification failure rolls back checkout, orders, inventory, and cart together", async () => {
  const db = createDatabase({ failNotification: true });
  const quantities = db.state.dishes.map((dish) => dish.availableQuantity);
  await assert.rejects(place(createOrdersService(db)), /simulated notification insert failure/);
  assert.equal(db.state.checkouts.length, 0);
  assert.equal(db.state.orders.length, 0);
  assert.equal(db.state.notifications.length, 0);
  assert.deepEqual(db.state.dishes.map((dish) => dish.availableQuantity), quantities);
  assert.equal(db.state.cartItems.length, 2);
});

test("customer order detail and history queries are isolated by owner", async () => {
  const db = createDatabase();
  const service = createOrdersService(db);
  const checkout = await place(service);
  assert.equal((await service.getOrder("customer-1", checkout.id)).id, checkout.id);
  await assert.rejects(service.getOrder("customer-2", checkout.id), { statusCode: 404 });
  assert.deepEqual(await service.listOrders("customer-2"), []);
});

test("customer can cancel a full multi-cook checkout before five minutes and releases reserved stock once", async () => {
  const db = createDatabase();
  const service = createOrdersService(db, { now: () => at(4, 59) });
  const checkout = await place(service);
  const before = db.state.dishes.map((dish) => dish.availableQuantity);
  const cancelled = await service.cancelCheckout("customer-1", checkout.id);
  assert.equal(cancelled.canCancel, false);
  assert.ok(cancelled.orders.every((order) => order.status === "CANCELLED"));
  assert.equal(db.state.notifications.filter((item) => item.portal === "CUSTOMER" && item.metadata.toStatus === "CANCELLED").length, 2);
  assert.deepEqual(db.state.notifications.filter((item) => item.portal === "COOK" && item.metadata.toStatus === "CANCELLED").map((item) => item.userId), [
    "cook-user-cook-1", "cook-user-cook-2",
  ]);
  assert.deepEqual(db.state.dishes.map((dish) => dish.availableQuantity), before.map((quantity, index) => quantity + [2, 1][index]));
  const notificationsAfterCancellation = db.state.notifications.length;
  await service.cancelCheckout("customer-1", checkout.id);
  assert.equal(db.state.notifications.length, notificationsAfterCancellation, "retrying cancellation does not duplicate notifications");
  assert.deepEqual(db.state.dishes.map((dish) => dish.availableQuantity), before.map((quantity, index) => quantity + [2, 1][index]));
});

test("customer cancellation is denied at or after the deadline, after cook acceptance, and for another customer", async () => {
  const timedDb = createDatabase();
  const timedService = createOrdersService(timedDb, { now: () => at(5) });
  const timedCheckout = await place(timedService);
  await assert.rejects(timedService.cancelCheckout("customer-1", timedCheckout.id), { statusCode: 409 });

  const acceptedDb = createDatabase();
  const acceptedService = createOrdersService(acceptedDb, { now: () => at(2) });
  const acceptedCheckout = await place(acceptedService);
  acceptedDb.state.orders[0].status = "CONFIRMED";
  await assert.rejects(acceptedService.cancelCheckout("customer-1", acceptedCheckout.id), { statusCode: 409 });
  await assert.rejects(acceptedService.cancelCheckout("customer-2", acceptedCheckout.id), { statusCode: 404 });
  assert.equal(acceptedDb.state.orders[1].status, "PENDING");
});

test("customer cannot cancel a successful mock-paid multi-cook checkout without refund support", async () => {
  const db = createDatabase();
  const service = createOrdersService(db, { now: () => at(1) });
  const checkout = await place(service);
  db.state.checkouts[0].paymentMethod = "ONLINE";
  db.state.orders.forEach((order) => { order.paymentStatus = "PAID"; });
  const quantities = db.state.dishes.map((dish) => dish.availableQuantity);

  const detail = await service.getOrder("customer-1", checkout.id);
  assert.equal(detail.canCancel, false);
  assert.match(detail.cancellationReason, /refunds are not supported/i);
  await assert.rejects(service.cancelCheckout("customer-1", checkout.id), { statusCode: 409 });
  assert.ok(db.state.orders.every((order) => order.status === "PENDING" && order.paymentStatus === "PAID"));
  assert.deepEqual(db.state.dishes.map((dish) => dish.availableQuantity), quantities);
  db.state.orders.forEach((order) => { order.status = "CANCELLED"; });
  await assert.rejects(service.cancelCheckout("customer-1", checkout.id), { statusCode: 409 }, "legacy paid/cancelled contradictions must not be acknowledged as a valid refund");
});

test("customer cancellation rejects a partially eligible multi-cook checkout atomically", async () => {
  const db = createDatabase();
  const service = createOrdersService(db, { now: () => at(1) });
  const checkout = await place(service);
  db.state.orders[1].status = "CONFIRMED";
  const quantities = db.state.dishes.map((dish) => dish.availableQuantity);
  await assert.rejects(service.cancelCheckout("customer-1", checkout.id), { statusCode: 409 });
  assert.equal(db.state.orders[0].status, "PENDING");
  assert.equal(db.state.orders[1].status, "CONFIRMED");
  assert.deepEqual(db.state.dishes.map((dish) => dish.availableQuantity), quantities);
});

test("cancellation rollback preserves order status and stock when a stock update fails", async () => {
  const db = createDatabase({ failStockRelease: true });
  const service = createOrdersService(db, { now: () => at(1) });
  const checkout = await place(service);
  const quantities = db.state.dishes.map((dish) => dish.availableQuantity);
  await assert.rejects(service.cancelCheckout("customer-1", checkout.id), /simulated stock release failure/);
  assert.ok(db.state.orders.every((order) => order.status === "PENDING"));
  assert.deepEqual(db.state.dishes.map((dish) => dish.availableQuantity), quantities);
});

test("serialization retry after a concurrent full cancellation does not release stock twice", async () => {
  const db = createDatabase();
  const service = createOrdersService(db, { now: () => at(1) });
  const checkout = await place(service);
  const before = db.state.dishes.map((dish) => dish.availableQuantity);
  db.$transaction = async () => {
    db.state.orders.forEach((order) => { order.status = "CANCELLED"; });
    db.state.dishes[0].availableQuantity += 2;
    db.state.dishes[1].availableQuantity += 1;
    throw Object.assign(new Error("serialization failure"), { code: "P2034" });
  };
  const response = await service.cancelCheckout("customer-1", checkout.id);
  assert.ok(response.orders.every((order) => order.status === "CANCELLED"));
  assert.deepEqual(db.state.dishes.map((dish) => dish.availableQuantity), before.map((quantity, index) => quantity + [2, 1][index]));
});

test("legacy per-cook orders remain visible in the customer's history", async () => {
  const legacy = {
    id: "legacy-order", customerId: "customer-1", checkoutId: null,
    orderNumber: "TB-OLD-1", cookId: "cook-1", cookName: "Kitchen cook-1",
    status: "DELIVERED", paymentStatus: "PAID", subtotal: 10, deliveryFee: 30,
    platformFee: 1, totalAmount: 41, createdAt: new Date("2026-10-14T10:00:00Z"),
    items: [{ id: "legacy-line", name: "Old dish", quantity: 1, unitPrice: 10, totalPrice: 10 }],
    cook: { id: "cook-1", businessName: "Kitchen cook-1" }, address: validAddress("address-1", "customer-1"),
  };
  const db = createDatabase({ cartItems: [], orders: [legacy] });
  const service = createOrdersService(db);
  assert.equal((await service.listOrders("customer-1"))[0].id, "legacy-order");
  assert.equal((await service.getOrder("customer-1", "legacy-order")).orders[0].items[0].name, "Old dish");
  await assert.rejects(service.getOrder("customer-2", "legacy-order"), { statusCode: 404 });
});

test("loadCheckoutReviewData and placeOrder execute queries sequentially on transaction client without query overlap", async () => {
  let activeQueries = 0;
  let maxConcurrent = 0;

  const track = (fn) => async (...args) => {
    activeQueries++;
    maxConcurrent = Math.max(maxConcurrent, activeQueries);
    await new Promise((resolve) => setImmediate(resolve));
    try {
      return await fn(...args);
    } finally {
      activeQueries--;
    }
  };

  const wrapDelegate = (target) => {
    const wrapped = {};
    for (const [key, val] of Object.entries(target)) {
      if (typeof val === "function") {
        wrapped[key] = track(val.bind(target));
      } else if (val && typeof val === "object") {
        wrapped[key] = wrapDelegate(val);
      } else {
        wrapped[key] = val;
      }
    }
    return wrapped;
  };

  const db = createDatabase();
  const rawTx = db.$transaction;
  db.$transaction = async (callback) => {
    return rawTx(async (tx) => {
      const monitoredTx = wrapDelegate(tx);
      return callback(monitoredTx);
    });
  };

  const service = createOrdersService(db);
  await place(service);

  assert.equal(maxConcurrent, 1, "Queries on transaction client must not overlap (maxConcurrent must be 1)");
});

