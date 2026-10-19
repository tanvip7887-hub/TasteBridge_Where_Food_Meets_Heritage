import assert from "node:assert/strict";
import test from "node:test";
import { createPaymentsService } from "../modules/payments/payments.service.js";
import { createOrdersService } from "../modules/orders/orders.service.js";
import { confirmPaymentAttemptSchema, initiateOnlineCheckoutSchema } from "../modules/payments/payments.validation.js";
import { placeOrderSchema } from "../modules/orders/orders.validation.js";

const now = new Date("2026-10-15T12:00:00.000Z");
const idempotencyKey = "cb1b4600-b529-4797-88c2-9554eab86e85";

const makeDish = (id, cookId, price) => ({
  id, cookId, name: `Dish ${id}`, cuisine: "Pune", price, image: `https://images.test/${id}.png`,
  status: "PUBLISHED", isAvailable: true, availableQuantity: 4,
  category: { id: "category-1", name: "Meals", isActive: true },
  cook: {
    id: cookId, businessName: `Kitchen ${cookId}`, bio: "Traditional home cooking made fresh every day.",
    experienceYears: "5 years", specialization: "Idli", cuisines: ["South Indian"],
    dietaryPreferences: ["Vegetarian"], city: "Pune", locality: "Aundh", cookingCapacity: "20 meals",
    availableDays: ["Monday"], availableMealSlots: ["Lunch"], prepTimeNotice: "Same day",
    isHomeKitchenDeclared: true, foodSafetyConsent: true, verificationStatus: "APPROVED",
    fssaiStatus: "APPROVED", fssaiExpiryDate: new Date("2027-12-31T23:59:59.999Z"),
    isApprovedToSell: true, isOpen: true, user: { role: "COOK", status: "ACTIVE" },
  },
});

const createDatabase = ({ unavailable = false, noAddress = false, failOrderAt = 0 } = {}) => {
  let state = {
    cart: { id: "cart-1", customerId: "customer-1" },
    cartItems: [
      { id: "cart-line-1", cartId: "cart-1", dishId: "dish-1", quantity: 2, createdAt: now, updatedAt: now },
      { id: "cart-line-2", cartId: "cart-1", dishId: "dish-2", quantity: 1, createdAt: now, updatedAt: now },
    ],
    dishes: [makeDish("dish-1", "cook-1", "12.25"), makeDish("dish-2", "cook-2", "20.00"), makeDish("dish-3", "cook-3", "30.00")],
    addresses: noAddress ? [] : [{
      id: "address-1", userId: "customer-1", recipientName: "Asha Rao", phone: "+919876543210",
      addressLine1: "Flat 2", locality: "Aundh", city: "Pune", state: "Maharashtra", pincode: "411007", isDefault: true,
    }],
    checkouts: [], checkoutLines: [], cookSnapshots: [], attempts: [], events: [], orders: [], orderCreates: 0, orderStatusHistory: [], notifications: [],
  };
  if (unavailable) state.dishes[0].availableQuantity = 1;

  const matches = (row, where) => Object.entries(where || {}).every(([key, value]) => value === undefined
    || (value instanceof Date ? row[key] instanceof Date && row[key].getTime() === value.getTime() : row[key] === value));
  const checkoutFor = (target, checkoutId) => target.checkouts.find((row) => row.id === checkoutId);
  const customerMatches = (target, attempt, customerId) => checkoutFor(target, attempt.checkoutId)?.customerId === customerId;
  const hydrateCheckout = (target, checkout, include = {}) => ({
    ...checkout,
    ...(include.lines ? { lines: target.checkoutLines.filter((line) => line.checkoutId === checkout.id) } : {}),
    ...(include.cookSnapshots ? { cookSnapshots: target.cookSnapshots.filter((cook) => cook.checkoutId === checkout.id) } : {}),
    ...(include.orders ? { orders: target.orders.filter((order) => order.checkoutId === checkout.id) } : {}),
  });

  const clientFor = (target) => ({
    async $queryRaw() { return [...new Set(target.dishes.map((dish) => dish.cookId))].map((id) => ({ id })); },
    cookProfile: { async findUnique({ where }) { return { userId: `cook-user-${where.id}` }; } },
    userNotification: {
      async upsert({ where, create }) {
        const key = `${where.userId_portal_eventKey.userId}|${where.userId_portal_eventKey.portal}|${where.userId_portal_eventKey.eventKey}`;
        let row = target.notifications.find((item) => item.key === key);
        if (!row) { row = { key, ...structuredClone(create) }; target.notifications.push(row); }
        return row;
      },
    },
    cart: {
      async findUnique({ where }) {
        if (target.cart?.customerId !== where.customerId) return null;
        if (where.select) return { id: target.cart.id };
        return {
          ...target.cart,
          items: target.cartItems.filter((item) => item.cartId === target.cart.id).map((item) => ({
            ...item, dish: target.dishes.find((dish) => dish.id === item.dishId) || null,
          })),
        };
      },
    },
    address: { async findMany({ where }) { return target.addresses.filter((address) => address.userId === where.userId); } },
    platformSettings: { async findUnique() { return { id: "default", platformFeePercent: "10.0000", deliveryFeeBase: "30.00" }; } },
    checkout: {
      async findFirst({ where, include }) {
        const row = target.checkouts.find((candidate) => matches(candidate, where));
        if (!row) return null;
        return {
          ...hydrateCheckout(target, row, include || {}),
          ...(include?.paymentAttempts ? { paymentAttempts: target.attempts.filter((attempt) => attempt.checkoutId === row.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, include.paymentAttempts.take || undefined) } : {}),
        };
      },
      async create({ data }) {
        const row = { id: `checkout-${target.checkouts.length + 1}`, createdAt: now, ...structuredClone(data) };
        target.checkouts.push(row);
        return row;
      },
    },
    checkoutLine: {
      async createMany({ data }) {
        target.checkoutLines.push(...data.map((row, index) => ({ id: `snapshot-${target.checkoutLines.length + index + 1}`, createdAt: now, ...structuredClone(row) })));
        return { count: data.length };
      },
    },
    checkoutCookSnapshot: {
      async createMany({ data }) {
        target.cookSnapshots.push(...data.map((row, index) => ({ id: `cook-snapshot-${target.cookSnapshots.length + index + 1}`, createdAt: now, ...structuredClone(row) })));
        return { count: data.length };
      },
    },
    dish: {
      async findMany({ where }) { return target.dishes.filter((dish) => where.id.in.includes(dish.id)); },
      async updateMany({ where, data }) {
        const dish = target.dishes.find((row) => row.id === where.id && row.status === where.status && row.isAvailable === where.isAvailable && row.availableQuantity >= where.availableQuantity.gte);
        if (!dish) return { count: 0 };
        dish.availableQuantity -= data.availableQuantity.decrement;
        return { count: 1 };
      },
    },
    order: {
      async create({ data }) {
        target.orderCreates += 1;
        if (failOrderAt && target.orderCreates === failOrderAt) throw new Error("simulated order insert failure");
        const { items, ...orderData } = data;
        const order = {
          id: `order-${target.orders.length + 1}`,
          createdAt: now,
          ...structuredClone(orderData),
          items: items.create.map((item, index) => ({ id: `order-item-${target.orders.length + 1}-${index + 1}`, ...structuredClone(item) })),
        };
        target.orders.push(order);
        return order;
      },
    },
    orderStatusHistory: {
      async create({ data }) {
        const event = { id: `order-status-${target.orderStatusHistory.length + 1}`, changedAt: now, ...structuredClone(data) };
        target.orderStatusHistory.push(event);
        return event;
      },
    },
    paymentAttempt: {
      async findMany({ where }) {
        return target.attempts.filter((attempt) => matches(attempt, { status: where.status })
          && (where.expiresAt?.lte ? attempt.expiresAt <= where.expiresAt.lte : true)
          && customerMatches(target, attempt, where.checkout.is.customerId)
          && checkoutFor(target, attempt.checkoutId)?.paymentMethod === where.checkout.is.paymentMethod).map(({ id }) => ({ id }));
      },
      async findFirst({ where, include, orderBy }) {
        let rows = target.attempts.filter((attempt) => matches(attempt, { id: where.id, status: where.status })
          && (where.expiresAt?.gt ? attempt.expiresAt > where.expiresAt.gt : true)
          && customerMatches(target, attempt, where.checkout?.is?.customerId ?? where.checkout?.customerId));
        if (where.checkout?.is?.paymentMethod) rows = rows.filter((attempt) => checkoutFor(target, attempt.checkoutId)?.paymentMethod === where.checkout.is.paymentMethod);
        if (orderBy) rows.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
        const row = rows[0];
        if (!row) return null;
        return { ...row, ...(include?.checkout ? { checkout: hydrateCheckout(target, checkoutFor(target, row.checkoutId), include.checkout.include || {}) } : {}) };
      },
      async create({ data }) {
        if (target.attempts.some((attempt) => attempt.checkoutId === data.checkoutId && attempt.status === "PENDING")) {
          const error = new Error("unique pending attempt"); error.code = "P2002"; throw error;
        }
        const { events, ...attemptData } = data;
        const row = { id: `attempt-${target.attempts.length + 1}`, createdAt: now, updatedAt: now, ...structuredClone(attemptData) };
        target.attempts.push(row);
        if (events?.create) target.events.push({ id: `event-${target.events.length + 1}`, paymentAttemptId: row.id, createdAt: now, ...structuredClone(events.create) });
        return row;
      },
      async updateMany({ where, data }) {
        const row = target.attempts.find((attempt) => matches(attempt, { id: where.id, status: where.status })
          && (where.expiresAt?.lte ? attempt.expiresAt <= where.expiresAt.lte : true)
          && (where.expiresAt?.gt ? attempt.expiresAt > where.expiresAt.gt : true));
        if (!row) return { count: 0 };
        Object.assign(row, structuredClone(data));
        return { count: 1 };
      },
    },
    paymentAttemptEvent: {
      async create({ data }) { const row = { id: `event-${target.events.length + 1}`, createdAt: now, ...structuredClone(data) }; target.events.push(row); return row; },
    },
    cartItem: {
      async deleteMany({ where }) {
        const before = target.cartItems.length;
        target.cartItems = target.cartItems.filter((item) => !matches(item, where));
        return { count: before - target.cartItems.length };
      },
    },
  });

  const db = clientFor(state);
  let transactionTail = Promise.resolve();
  db.$transaction = async (callback) => {
    const previous = transactionTail;
    let release;
    transactionTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const draft = structuredClone(state);
      const result = await callback(clientFor(draft));
      // Root-client delegates close over the original state object. Commit the
      // draft in place so reads after a transaction observe the committed data.
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, draft);
      return result;
    } finally { release(); }
  };
  Object.defineProperty(db, "state", { get: () => state });
  return db;
};

const provider = {
  async createPayment({ amount, currency, expiresAt }) {
    return { reference: "TB-SIM-TEST-001", amount: String(amount), currency, method: "SIMULATED", methodLabel: "TasteBridge simulated payment", status: "PENDING", expiresAt };
  },
  async confirmPayment({ reference, mockOutcome }) { return { reference, status: mockOutcome === "FAILURE" ? "FAILED" : mockOutcome === "SUCCESS" ? "SUCCEEDED" : null }; },
};

const initiate = (service, key = idempotencyKey) => service.initiateOnlineCheckout("customer-1", { addressId: "address-1", idempotencyKey: key });

test("online checkout snapshots basket and uses persisted server total without side effects", async () => {
  const db = createDatabase();
  const result = await initiate(createPaymentsService(db, { provider, now: () => now }));
  assert.equal(result.totalAmount, 108.95);
  assert.equal(result.paymentAttempt.amount, 108.95);
  assert.equal(result.paymentAttempt.status, "PENDING");
  assert.equal(db.state.checkouts[0].totalAmount, "108.95");
  assert.equal(db.state.checkoutLines.length, 2);
  assert.deepEqual(db.state.checkoutLines.map((line) => [line.cookId, line.dishName, line.quantity, line.unitPrice, line.totalPrice]), [
    ["cook-1", "Dish dish-1", 2, "12.25", "24.50"],
    ["cook-2", "Dish dish-2", 1, "20.00", "20.00"],
  ]);
  assert.equal(db.state.attempts[0].amount, "108.95");
  assert.equal(db.state.attempts[0].status, "PENDING");
  assert.equal(db.state.events[0].toStatus, "PENDING");
  assert.equal(db.state.dishes[0].availableQuantity, 4);
  assert.equal(db.state.cartItems.length, 2);
  assert.equal(db.state.orders.length, 0);
});

test("same idempotency key returns the existing attempt and different concurrent initiation reuses active attempt", async () => {
  const db = createDatabase();
  const service = createPaymentsService(db, { provider, now: () => now });
  const [first, retry, concurrent] = await Promise.all([
    initiate(service), initiate(service), initiate(service, "b3f707aa-c3b3-4df5-87df-2e1d941e9b2d"),
  ]);
  assert.equal(first.paymentAttempt.id, retry.paymentAttempt.id);
  assert.equal(first.paymentAttempt.id, concurrent.paymentAttempt.id);
  assert.equal(db.state.checkouts.length, 1);
  assert.equal(db.state.attempts.length, 1);
});

test("payment attempt reads and cancellation enforce checkout ownership", async () => {
  const db = createDatabase();
  const service = createPaymentsService(db, { provider, now: () => now });
  const checkout = await initiate(service);
  await assert.rejects(service.getAttempt("customer-2", checkout.paymentAttempt.id), { statusCode: 404 });
  await assert.rejects(service.cancelAttempt("customer-2", checkout.paymentAttempt.id), { statusCode: 404 });
  const cancelled = await service.cancelAttempt("customer-1", checkout.paymentAttempt.id);
  assert.equal(cancelled.status, "FAILED");
  assert.equal(db.state.events.at(-1).reasonCode, "CUSTOMER_CANCELLED");
  const repeatedCancel = await service.cancelAttempt("customer-1", checkout.paymentAttempt.id);
  assert.equal(repeatedCancel.status, "FAILED");
  assert.equal(db.state.events.filter((event) => event.reasonCode === "CUSTOMER_CANCELLED").length, 1);
  assert.equal(db.state.dishes[0].availableQuantity, 4);
  assert.equal(db.state.cartItems.length, 2);
  assert.equal(db.state.orders.length, 0);
});

test("invalid address and unavailable cart are rejected without creating a checkout", async () => {
  const missingAddressDb = createDatabase({ noAddress: true });
  await assert.rejects(initiate(createPaymentsService(missingAddressDb, { provider, now: () => now })), { statusCode: 404 });
  const unavailableDb = createDatabase({ unavailable: true });
  await assert.rejects(initiate(createPaymentsService(unavailableDb, { provider, now: () => now })), { statusCode: 409 });
  for (const db of [missingAddressDb, unavailableDb]) {
    assert.equal(db.state.checkouts.length, 0);
    assert.equal(db.state.attempts.length, 0);
    assert.equal(db.state.orders.length, 0);
    assert.equal(db.state.cartItems.length, 2);
  }
});

test("provider initialization failure rolls back checkout and immutable line snapshots", async () => {
  const db = createDatabase();
  const failingProvider = { async createPayment() { throw new Error("simulated provider initialization failure"); } };
  await assert.rejects(
    initiate(createPaymentsService(db, { provider: failingProvider, now: () => now })),
    /simulated provider initialization failure/,
  );
  assert.equal(db.state.checkouts.length, 0);
  assert.equal(db.state.checkoutLines.length, 0);
  assert.equal(db.state.attempts.length, 0);
  assert.equal(db.state.cartItems.length, 2);
  assert.equal(db.state.dishes[0].availableQuantity, 4);
});

test("expired attempt records a guarded transition and leaves cart, stock, and orders unchanged", async () => {
  const db = createDatabase();
  const service = createPaymentsService(db, { provider, now: () => now });
  const checkout = await initiate(service);
  db.state.attempts[0].expiresAt = new Date(now.getTime() - 1);
  const expired = await service.getAttempt("customer-1", checkout.paymentAttempt.id);
  assert.equal(expired.status, "EXPIRED");
  assert.equal(db.state.events.at(-1).toStatus, "EXPIRED");
  assert.equal(db.state.events.at(-1).reasonCode, "TIMEOUT");
  assert.equal(db.state.dishes[0].availableQuantity, 4);
  assert.equal(db.state.cartItems.length, 2);
  assert.equal(db.state.orders.length, 0);
});

test("online checkout validation cannot carry client payment status and COD placement remains separate", () => {
  assert.equal(initiateOnlineCheckoutSchema.body.safeParse({ addressId: "address-1", idempotencyKey }).success, true);
  assert.equal(initiateOnlineCheckoutSchema.body.safeParse({ addressId: "address-1", idempotencyKey, success: true }).success, false);
  assert.equal(initiateOnlineCheckoutSchema.body.safeParse({ addressId: "address-1", idempotencyKey, status: "SUCCEEDED" }).success, false);
  assert.equal(confirmPaymentAttemptSchema.body.safeParse(undefined).success, true);
  assert.equal(confirmPaymentAttemptSchema.body.safeParse({ success: true }).success, false);
  assert.equal(confirmPaymentAttemptSchema.body.safeParse({ paid: true }).success, false);
  assert.equal(confirmPaymentAttemptSchema.body.safeParse({ amount: 108.95 }).success, false);
  assert.equal(confirmPaymentAttemptSchema.body.safeParse({ status: "SUCCEEDED" }).success, false);
  assert.equal(confirmPaymentAttemptSchema.body.safeParse({ mockOutcome: "SUCCESS" }).success, true);
  assert.equal(confirmPaymentAttemptSchema.body.safeParse({ mockOutcome: "FAILURE" }).success, true);
  assert.equal(confirmPaymentAttemptSchema.body.safeParse({ mockOutcome: "SUCCEEDED" }).success, false);
  assert.equal(placeOrderSchema.body.safeParse({ addressId: "address-1", idempotencyKey, paymentMethod: "COD" }).success, true);
  assert.equal(placeOrderSchema.body.safeParse({ addressId: "address-1", idempotencyKey, paymentMethod: "ONLINE" }).success, false);
});

test("trusted simulated confirmation creates multi-cook paid orders from snapshots", async () => {
  const db = createDatabase();
  const service = createPaymentsService(db, { provider, now: () => now });
  const checkout = await initiate(service);
  const result = await service.confirmAttempt("customer-1", checkout.paymentAttempt.id, { mockOutcome: "SUCCESS" });
  assert.equal(result.paymentAttempt.status, "SUCCEEDED");
  assert.equal(result.totalAmount, 108.95);
  assert.equal(result.orders.length, 2);
  assert.deepEqual(db.state.orders.map((order) => [order.cookId, order.status, order.paymentStatus, order.totalAmount]), [
    ["cook-1", "PENDING", "PAID", "56.95"],
    ["cook-2", "PENDING", "PAID", "52.00"],
  ]);
  assert.deepEqual(db.state.orders[0].items.map((item) => [item.name, item.quantity, item.unitPrice, item.totalPrice]), [
    ["Dish dish-1", 2, "12.25", "24.50"],
  ]);
  assert.equal(db.state.attempts[0].status, "SUCCEEDED");
  assert.equal(db.state.events.at(-1).toStatus, "SUCCEEDED");
  assert.deepEqual(db.state.notifications.map(({ userId, portal, metadata }) => [userId, portal, metadata.kind]), [
    ["cook-user-cook-1", "COOK", "ORDER_CREATED"],
    ["cook-user-cook-2", "COOK", "ORDER_CREATED"],
    ["customer-1", "CUSTOMER", "CHECKOUT_PLACED"],
  ]);
  assert.equal(db.state.dishes[0].availableQuantity, 2);
  assert.equal(db.state.dishes[1].availableQuantity, 3);
  assert.equal(db.state.cartItems.length, 0);
});

test("repeated and concurrent confirmation creates orders and deducts stock only once", async () => {
  const db = createDatabase();
  const service = createPaymentsService(db, { provider, now: () => now });
  const checkout = await initiate(service);
  const [first, concurrent] = await Promise.all([
    service.confirmAttempt("customer-1", checkout.paymentAttempt.id, { mockOutcome: "SUCCESS" }),
    service.confirmAttempt("customer-1", checkout.paymentAttempt.id, { mockOutcome: "SUCCESS" }),
  ]);
  const repeated = await service.confirmAttempt("customer-1", checkout.paymentAttempt.id, { mockOutcome: "SUCCESS" });
  assert.equal(first.paymentAttempt.status, "SUCCEEDED");
  assert.equal(concurrent.paymentAttempt.status, "SUCCEEDED");
  assert.equal(repeated.orders.length, 2);
  assert.equal(db.state.orders.length, 2);
  assert.equal(db.state.dishes[0].availableQuantity, 2);
  assert.equal(db.state.events.filter((event) => event.toStatus === "SUCCEEDED").length, 1);
  assert.equal(db.state.notifications.length, 3, "repeated confirmation does not duplicate order notifications");
});

test("confirmation rejects another customer's attempt", async () => {
  const db = createDatabase();
  const service = createPaymentsService(db, { provider, now: () => now });
  const checkout = await initiate(service);
  await assert.rejects(service.confirmAttempt("customer-2", checkout.paymentAttempt.id), { statusCode: 404 });
  assert.equal(db.state.attempts[0].status, "PENDING");
  assert.equal(db.state.orders.length, 0);
});

test("expired attempts cannot confirm and leave stock, cart, and orders unchanged", async () => {
  const db = createDatabase();
  const service = createPaymentsService(db, { provider, now: () => now });
  const checkout = await initiate(service);
  db.state.attempts[0].expiresAt = new Date(now.getTime() - 1);
  await assert.rejects(service.confirmAttempt("customer-1", checkout.paymentAttempt.id), { statusCode: 409 });
  assert.equal(db.state.attempts[0].status, "EXPIRED");
  assert.equal(db.state.dishes[0].availableQuantity, 4);
  assert.equal(db.state.cartItems.length, 2);
  assert.equal(db.state.orders.length, 0);
});

test("stock or eligibility changes after initiation fail the simulated payment without fulfillment", async () => {
  for (const updateDish of [
    (dish) => { dish.availableQuantity = 1; },
    (dish) => { dish.status = "UNPUBLISHED"; },
    (dish) => { dish.cook.isOpen = false; },
  ]) {
    const db = createDatabase();
    const service = createPaymentsService(db, { provider, now: () => now });
    const checkout = await initiate(service);
    updateDish(db.state.dishes[0]);
    await assert.rejects(service.confirmAttempt("customer-1", checkout.paymentAttempt.id, { mockOutcome: "SUCCESS" }), { statusCode: 409 });
    assert.equal(db.state.attempts[0].status, "FAILED");
    assert.equal(db.state.orders.length, 0);
    assert.equal(db.state.cartItems.length, 2);
    assert.equal(db.state.dishes[1].availableQuantity, 4);
  }
});

test("transaction rollback preserves payment pending state, stock, cart, and orders", async () => {
  const db = createDatabase({ failOrderAt: 2 });
  const service = createPaymentsService(db, { provider, now: () => now });
  const checkout = await initiate(service);
  await assert.rejects(service.confirmAttempt("customer-1", checkout.paymentAttempt.id, { mockOutcome: "SUCCESS" }), /simulated order insert failure/);
  assert.equal(db.state.attempts[0].status, "PENDING");
  assert.equal(db.state.dishes[0].availableQuantity, 4);
  assert.equal(db.state.dishes[1].availableQuantity, 4);
  assert.equal(db.state.cartItems.length, 2);
  assert.equal(db.state.orders.length, 0);
  assert.equal(db.state.events.filter((event) => event.toStatus === "SUCCEEDED").length, 0);
  assert.equal(db.state.notifications.length, 0, "notifications roll back with failed fulfillment");
});

test("checkout and attempt amount mismatch fails closed", async () => {
  const db = createDatabase();
  const service = createPaymentsService(db, { provider, now: () => now });
  const checkout = await initiate(service);
  db.state.checkouts[0].totalAmount = "108.96";
  await assert.rejects(service.confirmAttempt("customer-1", checkout.paymentAttempt.id, { mockOutcome: "SUCCESS" }), { statusCode: 409 });
  assert.equal(db.state.attempts[0].status, "FAILED");
  assert.equal(db.state.orders.length, 0);
  assert.equal(db.state.cartItems.length, 2);
  assert.equal(db.state.dishes[0].availableQuantity, 4);
});

test("confirmation uses original cart snapshot and leaves later cart changes untouched", async () => {
  const db = createDatabase();
  const service = createPaymentsService(db, { provider, now: () => now });
  const checkout = await initiate(service);
  const changedAt = new Date(now.getTime() + 1000);
  db.state.cartItems[0].quantity = 3;
  db.state.cartItems[0].updatedAt = changedAt;
  db.state.cartItems.push({ id: "cart-line-added-later", cartId: "cart-1", dishId: "dish-3", quantity: 1, createdAt: changedAt, updatedAt: changedAt });
  const result = await service.confirmAttempt("customer-1", checkout.paymentAttempt.id, { mockOutcome: "SUCCESS" });
  assert.equal(result.paymentAttempt.status, "SUCCEEDED");
  assert.deepEqual(db.state.orders.flatMap((order) => order.items).map((item) => [item.dishId, item.quantity]), [
    ["dish-1", 2], ["dish-2", 1],
  ]);
  assert.deepEqual(db.state.cartItems.map((item) => [item.id, item.quantity]), [
    ["cart-line-1", 3], ["cart-line-added-later", 1],
  ]);
  assert.equal(db.state.dishes[0].availableQuantity, 2);
});

test("server-simulated provider failure records FAILED without fulfillment", async () => {
  const db = createDatabase();
  const service = createPaymentsService(db, { provider, now: () => now });
  const checkout = await initiate(service);
  const result = await service.confirmAttempt("customer-1", checkout.paymentAttempt.id, { mockOutcome: "FAILURE" });
  assert.equal(result.paymentAttempt.status, "FAILED");
  assert.equal(db.state.events.at(-1).reasonCode, "SIMULATED_DECLINE");
  assert.equal(db.state.orders.length, 0);
  assert.equal(db.state.dishes[0].availableQuantity, 4);
  assert.equal(db.state.cartItems.length, 2);
});

test("a successfully confirmed mock checkout cannot be cancelled as if a refund occurred", async () => {
  const db = createDatabase();
  const payments = createPaymentsService(db, { provider, now: () => now });
  const checkout = await initiate(payments);
  await payments.confirmAttempt("customer-1", checkout.paymentAttempt.id, { mockOutcome: "SUCCESS" });
  const quantities = db.state.dishes.map((dish) => dish.availableQuantity);

  await assert.rejects(
    createOrdersService(db, { now: () => now }).cancelCheckout("customer-1", checkout.id),
    { statusCode: 409 },
  );
  assert.equal(db.state.attempts[0].status, "SUCCEEDED");
  assert.ok(db.state.orders.every((order) => order.status === "PENDING" && order.paymentStatus === "PAID"));
  assert.deepEqual(db.state.dishes.map((dish) => dish.availableQuantity), quantities);
  assert.equal(db.state.cartItems.length, 0);
});

test("concurrent mock failures settle once without changing stock, cart, or orders", async () => {
  const db = createDatabase();
  const service = createPaymentsService(db, { provider, now: () => now });
  const checkout = await initiate(service);
  const outcomes = await Promise.all([
    service.confirmAttempt("customer-1", checkout.paymentAttempt.id, { mockOutcome: "FAILURE" }),
    service.confirmAttempt("customer-1", checkout.paymentAttempt.id, { mockOutcome: "FAILURE" }),
  ]);
  assert.deepEqual(outcomes.map((result) => result.paymentAttempt.status), ["FAILED", "FAILED"]);
  assert.equal(db.state.events.filter((event) => event.toStatus === "FAILED").length, 1);
  assert.equal(db.state.orders.length, 0);
  assert.equal(db.state.dishes[0].availableQuantity, 4);
  assert.equal(db.state.dishes[1].availableQuantity, 4);
  assert.equal(db.state.cartItems.length, 2);
});

test("pending confirmation requires an explicit mock choice and leaves data unchanged", async () => {
  const db = createDatabase();
  const checkout = await initiate(createPaymentsService(db, { provider, now: () => now }));
  await assert.rejects(
    createPaymentsService(db, { provider, now: () => now }).confirmAttempt("customer-1", checkout.paymentAttempt.id),
    { statusCode: 400 },
  );
  assert.equal(db.state.attempts[0].status, "PENDING");
  assert.equal(db.state.orders.length, 0);
  assert.equal(db.state.dishes[0].availableQuantity, 4);
  assert.equal(db.state.cartItems.length, 2);
});

test("mock success choice still uses transactional fulfillment and rejects production mock mode", async () => {
  const db = createDatabase();
  const checkout = await initiate(createPaymentsService(db, { provider, now: () => now }));
  const result = await createPaymentsService(db, { provider, now: () => now }).confirmAttempt(
    "customer-1", checkout.paymentAttempt.id, { mockOutcome: "SUCCESS" },
  );
  assert.equal(result.paymentAttempt.status, "SUCCEEDED");
  assert.equal(result.orders.length, 2);
  assert.equal(db.state.orders.length, 2);
  assert.equal(db.state.cartItems.length, 0);

  const lockedDb = createDatabase();
  await assert.rejects(
    initiate(createPaymentsService(lockedDb, { provider, now: () => now, allowMockPayments: false })),
    { statusCode: 503 },
  );
  assert.equal(lockedDb.state.checkouts.length, 0);
  assert.equal(lockedDb.state.attempts.length, 0);

  const pendingDb = createDatabase();
  const pending = await initiate(createPaymentsService(pendingDb, { provider, now: () => now }));
  await assert.rejects(
    createPaymentsService(pendingDb, { provider, now: () => now, allowMockPayments: false })
      .confirmAttempt("customer-1", pending.paymentAttempt.id, { mockOutcome: "SUCCESS" }),
    { statusCode: 503 },
  );
  assert.equal(pendingDb.state.attempts[0].status, "PENDING");
  assert.equal(pendingDb.state.orders.length, 0);
});

test("online checkout initiation and payment confirmation execute queries sequentially on transaction client without query overlap", async () => {
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
  db.$transaction = async (callback, options) => {
    return rawTx(async (tx) => {
      const monitoredTx = wrapDelegate(tx);
      return callback(monitoredTx);
    }, options);
  };

  const service = createPaymentsService(db, { provider, now: () => now });
  const initiation = await initiate(service);
  assert.equal(maxConcurrent, 1, "Queries during online checkout initiation must not overlap on tx");

  maxConcurrent = 0;
  await service.confirmAttempt("customer-1", initiation.paymentAttempt.id, { mockOutcome: "SUCCESS" });
  assert.equal(maxConcurrent, 1, "Queries during online payment confirmation must not overlap on tx");
});

