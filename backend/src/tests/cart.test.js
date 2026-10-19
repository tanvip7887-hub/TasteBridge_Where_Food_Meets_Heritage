import assert from "node:assert/strict";
import test from "node:test";
import { requireCartCustomer } from "../modules/cart/cart.auth.js";
import { createCartService, getCartDishEligibility } from "../modules/cart/cart.service.js";
import { addCartItemSchema, updateCartItemSchema } from "../modules/cart/cart.validation.js";

const readyCook = (overrides = {}) => ({
  id: "cook-1",
  businessName: "Radha Kitchen",
  bio: "Traditional home cooking made fresh every day.",
  experienceYears: "5 years",
  specialization: "Idli",
  cuisines: ["South Indian"],
  dietaryPreferences: ["Vegetarian"],
  city: "Pune",
  locality: "Aundh",
  cookingCapacity: "20 meals",
  availableDays: ["Monday"],
  availableMealSlots: ["Lunch"],
  prepTimeNotice: "Same day",
  isHomeKitchenDeclared: true,
  foodSafetyConsent: true,
  verificationStatus: "APPROVED",
  fssaiStatus: "APPROVED",
  fssaiExpiryDate: new Date("2027-12-31T23:59:59.999Z"),
  isApprovedToSell: true,
  isOpen: true,
  user: { role: "COOK", status: "ACTIVE" },
  ...overrides,
});

const makeDish = (id, overrides = {}) => {
  const cook = readyCook({ id: `cook-${id}`, businessName: `Kitchen ${id}`, ...overrides.cook });
  return {
    id,
    cookId: cook.id,
    name: `Dish ${id}`,
    description: `Description of ${id}`,
    cuisine: "South Indian",
    price: 12.5,
    image: null,
    isVegetarian: true,
    availableQuantity: 10,
    isAvailable: true,
    status: "PUBLISHED",
    category: { id: "category-1", name: "Breakfast", isActive: true },
    cook,
    ...overrides,
  };
};

const makeDatabase = (dishList) => {
  const dishes = new Map(dishList.map((dish) => [dish.id, dish]));
  const state = { cart: null, items: [] };
  const db = {
    async $queryRaw() { return [...new Set(dishList.map((dish) => dish.cookId))].map((id) => ({ id })); },
    async $transaction(callback) { return callback(db); },
    dish: { async findUnique({ where }) { return dishes.get(where.id) || null; } },
    cart: {
      async findUnique({ where, select }) {
        if (!state.cart || state.cart.customerId !== where.customerId) return null;
        if (select) return { id: state.cart.id };
        return {
          ...state.cart,
          items: state.items.filter((item) => item.cartId === state.cart.id).map((item) => ({
            ...item,
            dish: dishes.get(item.dishId) || null,
          })),
        };
      },
      async upsert({ where, create }) {
        if (!state.cart) state.cart = { id: "cart-1", customerId: create.customerId };
        assert.equal(state.cart.customerId, where.customerId);
        return { id: state.cart.id };
      },
    },
    cartItem: {
      async findUnique({ where }) {
        return state.items.find((item) => item.cartId === where.cartId_dishId.cartId && item.dishId === where.cartId_dishId.dishId) || null;
      },
      async findFirst({ where }) { return state.items.find((item) => item.id === where.id && item.cartId === where.cartId) || null; },
      async upsert({ where, create, update }) {
        let item = state.items.find((entry) => entry.cartId === where.cartId_dishId.cartId && entry.dishId === where.cartId_dishId.dishId);
        if (item) item.quantity += update.quantity.increment;
        else {
          item = { id: `item-${state.items.length + 1}`, ...create };
          state.items.push(item);
        }
        return item;
      },
      async update({ where, data }) {
        const item = state.items.find((entry) => entry.id === where.id);
        Object.assign(item, data);
        return item;
      },
      async deleteMany({ where }) {
        const before = state.items.length;
        state.items = state.items.filter((item) => item.id !== where.id || item.cartId !== where.cartId);
        return { count: before - state.items.length };
      },
    },
    get state() { return state; },
    dishes,
  };
  return db;
};

test("cart routes require active Customer portal and reject unauthenticated or unrelated roles", () => {
  const invoke = (user) => {
    let error;
    let continued = false;
    requireCartCustomer({ user: user && { ...user, activePortal: user.role === "COOK" ? "COOK" : user.role } }, {}, (nextError) => { error = nextError; continued = !nextError; });
    return { error, continued };
  };
  assert.equal(invoke(null).error.statusCode, 401);
  assert.equal(invoke({ role: "CUSTOMER", status: "ACTIVE" }).continued, true);
  assert.equal(invoke({ role: "CUSTOMER", status: "ACTIVE", cookProfile: { verificationStatus: "APPROVED" } }).continued, true);
  assert.equal(invoke({ role: "COOK", status: "ACTIVE", cookProfile: { verificationStatus: "APPROVED" } }).error.statusCode, 403);
  assert.equal(invoke({ role: "COOK", status: "ACTIVE", cookProfile: { verificationStatus: "PENDING" } }).error.statusCode, 403);
  assert.equal(invoke({ role: "COOK", status: "ACTIVE", cookProfile: { verificationStatus: "REJECTED" } }).error.statusCode, 403);
  assert.equal(invoke({ role: "COOK", status: "ACTIVE" }).error.statusCode, 403);
  assert.equal(invoke({ role: "ADMIN", status: "ACTIVE" }).error.statusCode, 403);
  assert.equal(invoke({ role: "DELIVERY_AGENT", status: "ACTIVE" }).error.statusCode, 403);
  assert.equal(invoke({ role: "CUSTOMER", status: "SUSPENDED" }).error.statusCode, 403);
});

test("cart quantity schemas reject zero, fractions, strings, and excessive quantities", () => {
  for (const quantity of [0, -1, 1.5, 100, "2"]) {
    assert.equal(addCartItemSchema.body.safeParse({ dishId: "dish-1", quantity }).success, false);
    assert.equal(updateCartItemSchema.body.safeParse({ quantity }).success, false);
  }
  assert.equal(addCartItemSchema.body.safeParse({ dishId: "dish-1" }).data.quantity, 1);
  assert.equal(updateCartItemSchema.body.safeParse({ quantity: 3 }).success, true);
});

test("dish eligibility fails closed for unpublished, unavailable, inactive-category, or non-ready kitchens", () => {
  const eligibleIds = new Set(["cook-dish-1"]);
  const now = new Date("2026-10-15T12:00:00.000Z");
  assert.equal(getCartDishEligibility(makeDish("dish-1"), eligibleIds, now).isAvailable, true);
  for (const dish of [
    makeDish("dish-1", { status: "DRAFT" }),
    makeDish("dish-1", { status: "PENDING_APPROVAL" }),
    makeDish("dish-1", { status: "REJECTED" }),
    makeDish("dish-1", { status: "UNPUBLISHED" }),
    makeDish("dish-1", { availableQuantity: 0 }),
    makeDish("dish-1", { category: { id: "category-1", name: "Breakfast", isActive: false } }),
    makeDish("dish-1", { cook: readyCook({ id: "cook-dish-1", isOpen: false }) }),
    makeDish("dish-1", { cook: readyCook({ id: "cook-dish-1", fssaiExpiryDate: new Date("2026-01-01") }) }),
  ]) assert.equal(getCartDishEligibility(dish, eligibleIds, now).isAvailable, false);
});

test("cart supports dishes from multiple cooks and totals use current server prices", async () => {
  const db = makeDatabase([makeDish("dish-1"), makeDish("dish-2", { price: 20, cook: readyCook({ id: "cook-2", businessName: "Kitchen two" }) })]);
  const service = createCartService(db);
  await service.addItem("customer-1", { dishId: "dish-1", quantity: 2 });
  const afterSecondCook = await service.addItem("customer-1", { dishId: "dish-2", quantity: 1 });
  assert.equal(afterSecondCook.items.length, 2);
  assert.equal(afterSecondCook.items[0].dish.cook.businessName, "Kitchen dish-1");
  assert.equal(afterSecondCook.totals.subtotal, 45);

  db.dishes.get("dish-1").price = 15;
  const refreshed = await service.getCart("customer-1");
  assert.equal(refreshed.items[0].unitPrice, 15);
  assert.equal(refreshed.totals.subtotal, 50);
});

test("cart calculations handle Prisma Decimal-like prices using integer paise", async () => {
  const db = makeDatabase([makeDish("dish-1", { price: { toString: () => "0.105" } })]);
  const service = createCartService(db);
  const cart = await service.addItem("customer-1", { dishId: "dish-1", quantity: 3 });
  assert.equal(cart.items[0].unitPrice, 0.11);
  assert.equal(cart.items[0].subtotal, 0.33);
  assert.equal(cart.totals.subtotal, 0.33);
});

test("duplicate adds increase one cart row and quantities cannot exceed current stock", async () => {
  const db = makeDatabase([makeDish("dish-1", { availableQuantity: 4 })]);
  const service = createCartService(db);
  await service.addItem("customer-1", { dishId: "dish-1", quantity: 2 });
  const duplicate = await service.addItem("customer-1", { dishId: "dish-1", quantity: 1 });
  assert.equal(db.state.items.length, 1);
  assert.equal(duplicate.items[0].quantity, 3);
  await assert.rejects(service.addItem("customer-1", { dishId: "dish-1", quantity: 2 }), { statusCode: 409 });
});

test("quantity updates revalidate stock and cannot modify another customer's cart", async () => {
  const db = makeDatabase([makeDish("dish-1", { availableQuantity: 5 })]);
  const service = createCartService(db);
  const added = await service.addItem("customer-1", { dishId: "dish-1", quantity: 1 });
  const itemId = added.items[0].id;
  const updated = await service.updateItem("customer-1", itemId, 4);
  assert.equal(updated.items[0].quantity, 4);
  await assert.rejects(service.updateItem("customer-1", itemId, 6), { statusCode: 409 });
  await assert.rejects(service.updateItem("customer-2", itemId, 2), { statusCode: 404 });
  await assert.rejects(service.removeItem("customer-2", itemId), { statusCode: 404 });
  assert.equal((await service.getCart("customer-1")).items[0].quantity, 4);
});

test("hidden dishes remain visible in an existing cart with an unavailable reason and excluded from total", async () => {
  const db = makeDatabase([makeDish("dish-1")]);
  const service = createCartService(db);
  await service.addItem("customer-1", { dishId: "dish-1", quantity: 1 });
  db.dishes.get("dish-1").cook.isOpen = false;
  const cart = await service.getCart("customer-1");
  assert.equal(cart.items[0].isAvailable, false);
  assert.ok(cart.items[0].unavailableReasons.some((reason) => /closed/i.test(reason)));
  assert.equal(cart.totals.subtotal, 0);
});

test("cart transactions execute queries sequentially on transaction client without query overlap", async () => {
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

  const db = makeDatabase([makeDish("dish-1", { availableQuantity: 5 })]);
  const rawTx = db.$transaction;
  db.$transaction = async (callback, options) => {
    return rawTx(async (tx) => {
      const monitoredTx = wrapDelegate(tx);
      return callback(monitoredTx);
    }, options);
  };

  const service = createCartService(db);
  const added = await service.addItem("customer-1", { dishId: "dish-1", quantity: 1 });
  assert.equal(maxConcurrent, 1, "Queries during cart addItem must not overlap on tx");

  maxConcurrent = 0;
  await service.updateItem("customer-1", added.items[0].id, 2);
  assert.equal(maxConcurrent, 1, "Queries during cart updateItem must not overlap on tx");
});

