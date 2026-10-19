import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("cart page renders server-provided dish, cook, quantity, and totals with empty and error states", async () => {
  const source = await readSource("../src/pages/CartPage.jsx");
  for (const expected of [
    "cartApi.getCart",
    "cartApi.updateItem",
    "cartApi.removeItem",
    "item.dish?.cook?.businessName",
    "item.unitPrice",
    "item.subtotal",
    "totals.subtotal",
    "Your cart is empty",
    "role=\"alert\"",
    "Currently unavailable",
    "Continue to checkout",
  ]) assert.ok(source.includes(expected), `expected cart page to include ${expected}`);
});

test("cart load errors are distinct from a successful empty cart and can be retried", async () => {
  const source = await readSource("../src/pages/CartPage.jsx");
  assert.match(source, /items\.length === 0 && error\s*\?/);
  assert.match(source, /Your cart could not be loaded/);
  assert.match(source, /onClick=\{\(\) => loadCart\(\)\}/);
  assert.match(source, /items\.length === 0 \?/);
  assert.match(source, /Your cart is empty/);
});

test("dish detail adds current dish id to the server cart and provides a cart link", async () => {
  const source = await readSource("../src/pages/DishDetailPage.jsx");
  assert.match(source, /cartApi\.addItem\(\{\s*dishId:\s*dish\.id,\s*quantity:\s*1\s*\}\)/);
  assert.match(source, /to="\/cart"/);
  assert.match(source, /Add to cart/);
});

test("cart route is protected and navigation badge follows persisted cart count", async () => {
  const [routes, navbar, api] = await Promise.all([
    readSource("../src/routes/AppRoutes.jsx"),
    readSource("../src/components/layout/Navbar.jsx"),
    readSource("../src/api/cartApi.js"),
  ]);
  assert.match(routes, /path="cart"\s+element=\{<ProtectedRoute><CartPage \/><\/ProtectedRoute>\}/);
  assert.match(navbar, /cartApi\.getCart/);
  assert.match(navbar, /const canUseCart = activePortal === "CUSTOMER"/);
  assert.match(navbar, /if \(!isAuthenticated \|\| !canUseCart\)/);
  assert.equal([...navbar.matchAll(/\{canUseCart && <Link/g)].length, 2, "desktop and mobile cart links should be limited to supported roles");
  assert.match(navbar, /CART_UPDATED_EVENT/);
  assert.match(navbar, /response\?\.data\?\.totals\?\.itemCount/);
  assert.match(api, /api\.post\("\/cart\/items", data\)\.then\(notifyCartUpdated\)/);
});

