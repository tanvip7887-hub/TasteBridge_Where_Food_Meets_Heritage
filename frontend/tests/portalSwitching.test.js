import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("portal switch calls the authenticated backend, replaces the session token, and updates Redux", async () => {
  const [slice, client] = await Promise.all([
    read("../src/store/slices/authSlice.js"),
    read("../src/api/axios.js"),
  ]);
  assert.match(slice, /api\.post\("\/auth\/switch-portal", \{ portal \}, \{ timeout: AUTH_REQUEST_TIMEOUT_MS \}\)/);
  assert.match(slice, /tokenStorage\.setToken\(result\.token\)/);
  assert.match(slice, /\.addCase\(switchPortal\.fulfilled/);
  assert.match(client, /Authorization = `Bearer \$\{token\}`/);
});

test("portal context is restored from the authenticated session after reload and cross-tab changes", async () => {
  const [slice, routes] = await Promise.all([
    read("../src/store/slices/authSlice.js"),
    read("../src/routes/AppRoutes.jsx"),
  ]);
  assert.match(slice, /const token = tokenStorage\.getToken\(\)/);
  assert.match(slice, /api\.get\("\/auth\/me", \{ timeout: AUTH_REQUEST_TIMEOUT_MS \}\)/);
  assert.match(routes, /window\.addEventListener\("storage", syncSession\)/);
  assert.match(routes, /dispatch\(initializeAuth\(\)\)/);
});

test("Customer pages select Customer context and approved Cook and Delivery Agent portals have explicit switches", async () => {
  const [routes, cookGuard, agentGuard, navbar, cookLayout, deliveryLayout] = await Promise.all([
    read("../src/routes/AppRoutes.jsx"),
    read("../src/routes/ApprovedCookRoute.jsx"),
    read("../src/routes/ApprovedDeliveryAgentRoute.jsx"),
    read("../src/components/layout/Navbar.jsx"),
    read("../src/layouts/CookLayout.jsx"),
    read("../src/layouts/DeliveryAgentLayout.jsx"),
  ]);
  assert.match(routes, /ActivePortalRoute portal="CUSTOMER"/);
  assert.match(cookGuard, /switchPortal\("COOK"\)/);
  assert.match(agentGuard, /switchPortal\("DELIVERY_AGENT"\)/);
  assert.match(navbar, /showCookPortalSwitch/);
  assert.match(navbar, /portal="DELIVERY_AGENT"/);
  assert.match(cookLayout, /portal="CUSTOMER"/);
  assert.match(deliveryLayout, /portal="CUSTOMER"/);
});

test("successful login opens the server-selected Cook or Delivery Agent portal directly", async () => {
  const loginForm = await read("../src/components/auth/LoginForm.jsx");
  assert.match(loginForm, /loggedInUser\?\.activePortal === "COOK"[\s\S]*?navigate\("\/cook"\)/);
  assert.match(loginForm, /loggedInUser\?\.activePortal === "DELIVERY_AGENT"[\s\S]*?navigate\("\/delivery-agent"\)/);
});

test("delivery history remains on its delivery-agent API client, separate from customer order history", async () => {
  const [deliveryApi, deliveryPage, orderApi] = await Promise.all([
    read("../src/api/deliveryAgentApi.js"),
    read("../src/pages/delivery/DeliveryAgentSectionPage.jsx"),
    read("../src/api/orderApi.js"),
  ]);
  assert.match(deliveryApi, /\/delivery-agents\/deliveries\/history/);
  assert.match(deliveryPage, /deliveryAgentApi\.listDeliveryHistory\(\)/);
  assert.match(orderApi, /api\.get\("\/orders"\)/);
});
