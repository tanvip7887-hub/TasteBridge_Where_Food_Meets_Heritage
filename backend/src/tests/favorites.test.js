import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import app from "../app.js";
import { createFavoritesService } from "../modules/favorites/favorites.service.js";
import { favoriteDishParamsSchema } from "../modules/favorites/favorites.validation.js";
import { requireCartCustomer } from "../modules/cart/cart.auth.js";

const eligibleQuery = async () => [{ id: "cook-1" }];
const publicDish = { id: "dish-1" };

test("favorites HTTP endpoints reject unauthenticated list and mutation requests", async (context) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/favorites`;

  const listResponse = await fetch(baseUrl);
  const addResponse = await fetch(`${baseUrl}/dish-1`, { method: "POST" });
  const removeResponse = await fetch(`${baseUrl}/dish-1`, { method: "DELETE" });
  assert.equal(listResponse.status, 401);
  assert.equal(addResponse.status, 401);
  assert.equal(removeResponse.status, 401);
});

test("favorite add uses the authenticated customer identity and is idempotent", async () => {
  const upserts = [];
  const database = {
    $queryRaw: eligibleQuery,
    dish: { async findFirst(query) { assert.equal(query.where.id, "dish-1"); return publicDish; } },
    customerFavorite: {
      async upsert(query) {
        upserts.push(query);
        return { id: "favorite-1", createdAt: new Date("2026-10-17T00:00:00Z") };
      },
    },
  };
  const service = createFavoritesService(database);

  const first = await service.add("customer-a", "dish-1");
  const retry = await service.add("customer-a", "dish-1");

  assert.equal(first.favoriteId, "favorite-1");
  assert.deepEqual(retry, first);
  assert.equal(upserts.length, 2);
  assert.deepEqual(upserts[0].where, { customerId_dishId: { customerId: "customer-a", dishId: "dish-1" } });
  assert.equal(upserts[0].create.customerId, "customer-a");
  assert.deepEqual(upserts[0].update, {});
});

test("favorite listing returns only the requested customer's publicly visible dishes with availability", async () => {
  let query;
  const database = {
    $queryRaw: eligibleQuery,
    customerFavorite: {
      async findMany(input) {
        query = input;
        return [{ id: "favorite-a", createdAt: new Date("2026-10-17T00:00:00Z"), dish: {
          id: "dish-1", name: "Idli", price: "25.50", isAvailable: false, availableQuantity: 0,
          cook: { businessName: "Kitchen" },
        } }];
      },
    },
  };
  const result = await createFavoritesService(database).list("customer-a");

  assert.equal(query.where.customerId, "customer-a");
  assert.equal(query.where.dish.is.status, "PUBLISHED");
  assert.equal(query.where.dish.is.cook.is.isOpen, true);
  assert.equal(query.where.dish.is.cook.is.id.in[0], "cook-1");
  assert.equal(query.select.dish.select.availableQuantity, true);
  assert.equal(result.items[0].price, 25.5);
  assert.equal(result.items[0].isAvailable, false);
  assert.equal(result.items[0].favoriteId, "favorite-a");
});

test("unavailable or hidden dishes cannot be newly favorited", async () => {
  const database = {
    $queryRaw: eligibleQuery,
    dish: { async findFirst(query) { assert.equal(query.where.isAvailable, true); return null; } },
    customerFavorite: { async upsert() { assert.fail("must not write a hidden dish favorite"); } },
  };
  await assert.rejects(createFavoritesService(database).add("customer-a", "dish-hidden"), {
    statusCode: 404,
    message: "Dish not found or currently unavailable.",
  });
});

test("favorite removal is scoped to customer and idempotent", async () => {
  let query;
  const database = { customerFavorite: { async deleteMany(input) { query = input; return { count: 0 }; } } };
  const result = await createFavoritesService(database).remove("customer-b", "dish-1");
  assert.deepEqual(query, { where: { customerId: "customer-b", dishId: "dish-1" } });
  assert.deepEqual(result, { dishId: "dish-1", isFavorite: false });
});

test("favorite reads remain isolated between customers", async () => {
  const queries = [];
  const database = {
    $queryRaw: eligibleQuery,
    customerFavorite: {
      async findMany(query) {
        queries.push(query.where.customerId);
        return [{ id: `favorite-${query.where.customerId}`, createdAt: new Date(), dish: {
          id: `dish-${query.where.customerId}`, name: "Dish", price: "10.00", isAvailable: true,
          availableQuantity: 1, cook: { businessName: "Kitchen" },
        } }];
      },
    },
  };
  const service = createFavoritesService(database);
  const [firstCustomer, secondCustomer] = await Promise.all([service.list("customer-a"), service.list("customer-b")]);
  assert.deepEqual(queries.sort(), ["customer-a", "customer-b"]);
  assert.deepEqual(firstCustomer.items.map((dish) => dish.id), ["dish-customer-a"]);
  assert.deepEqual(secondCustomer.items.map((dish) => dish.id), ["dish-customer-b"]);
});

test("favorite route requires authenticated Customer portal access and validates dish IDs", async () => {
  const routeSource = await readFile(new URL("../modules/favorites/favorites.routes.js", import.meta.url), "utf8");
  assert.match(routeSource, /router\.use\(authenticate, requireCartCustomer\)/);
  assert.equal(favoriteDishParamsSchema.params.safeParse({ dishId: "dish_123" }).success, true);
  assert.equal(favoriteDishParamsSchema.params.safeParse({ dishId: "../../User" }).success, false);
});

test("favorite authorization allows active Customer portal only", () => {
  const authorize = (user) => {
    let error;
    requireCartCustomer({ user }, null, (nextError) => { error = nextError; });
    return error;
  };
  assert.equal(authorize({ id: "customer-a", status: "ACTIVE", activePortal: "CUSTOMER" }), undefined);
  assert.equal(authorize({ id: "agent-a", status: "ACTIVE", activePortal: "DELIVERY_AGENT" }).statusCode, 403);
  assert.equal(authorize(null).statusCode, 401);
});
