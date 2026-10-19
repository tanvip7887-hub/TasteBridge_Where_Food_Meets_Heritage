import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import reducer, { addFavorite, clearFavorites, fetchFavorites, removeFavorite } from "../src/store/slices/favoritesSlice.js";

test("favorite state synchronizes a server list, adds once, and removes immediately", () => {
  let state = reducer(undefined, fetchFavorites.pending("fetch", "customer-a"));
  state = reducer(state, fetchFavorites.fulfilled({ customerId: "customer-a", items: [{ id: "dish-a" }, { id: "dish-b" }] }, "fetch", "customer-a"));
  assert.deepEqual(state.ids, ["dish-a", "dish-b"]);
  state = reducer(state, addFavorite.pending("add", { dishId: "dish-c", customerId: "customer-a" }));
  assert.ok(state.pendingDishIds.includes("dish-c"));
  state = reducer(state, addFavorite.fulfilled({ dishId: "dish-c", customerId: "customer-a" }, "add", { dishId: "dish-c", customerId: "customer-a" }));
  assert.ok(state.ids.includes("dish-c"));
  state = reducer(state, removeFavorite.pending("remove", { dishId: "dish-b", customerId: "customer-a" }));
  state = reducer(state, removeFavorite.fulfilled({ dishId: "dish-b", customerId: "customer-a" }, "remove", { dishId: "dish-b", customerId: "customer-a" }));
  assert.deepEqual(state.ids, ["dish-a", "dish-c"]);
});

test("session clearing removes favorites across logout or portal changes", () => {
  let populated = reducer(undefined, fetchFavorites.pending("fetch", "customer-a"));
  populated = reducer(populated, fetchFavorites.fulfilled({ customerId: "customer-a", items: [{ id: "dish-a" }] }, "fetch", "customer-a"));
  assert.deepEqual(reducer(populated, clearFavorites()).ids, []);
});

test("a favorite-list response from a cleared session cannot repopulate stale customer data", () => {
  let state = reducer(undefined, fetchFavorites.pending("stale-fetch", "customer-a"));
  state = reducer(state, clearFavorites());
  state = reducer(state, fetchFavorites.fulfilled({ customerId: "customer-a", items: [{ id: "private-dish" }] }, "stale-fetch", "customer-a"));
  assert.deepEqual(state.ids, []);
  assert.equal(state.currentCustomerId, null);
});

test("customer favorites page, marketplace cards, and dish details share the favorite control", async () => {
  const [routes, explore, detail, favoritesPage, navbar, sync] = await Promise.all([
    readFile(new URL("../src/routes/AppRoutes.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/ExplorePage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/DishDetailPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/FavoritesPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/layout/Navbar.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/favorites/FavoritesSessionSync.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(routes, /path="favourites" element={<ProtectedRoute><FavoritesPage \/><\/ProtectedRoute>}/);
  assert.match(explore, /<FavoriteButton dishId={dish\.id}/);
  assert.match(detail, /<FavoriteButton dishId={dish\.id}/);
  assert.match(favoritesPage, /No favorites yet/);
  assert.match(favoritesPage, /Browse dishes/);
  assert.match(favoritesPage, /Currently unavailable/);
  assert.match(navbar, /OPEN_AUTH_MODAL_EVENT/);
  assert.match(sync, /dispatch\(fetchFavorites\(user\.id\)\)/);
});
