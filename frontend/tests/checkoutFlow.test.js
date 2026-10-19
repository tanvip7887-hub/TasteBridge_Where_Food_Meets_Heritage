import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("checkout uses the authenticated order API, saved address selection, and idempotent submission", async () => {
  const [page, api] = await Promise.all([
    source("../src/pages/CheckoutPage.jsx"),
    source("../src/api/orderApi.js"),
  ]);
  assert.match(api, /api\.get\("\/orders\/checkout\/summary"/);
  assert.match(api, /api\.post\("\/orders", data\)/);
  assert.match(page, /idempotencyKey: getRequestKey\(\)/);
  assert.match(page, /sessionStorage\.setItem\(requestKeyStorage, key\)/);
  assert.match(page, /value=\{selectedAddressId\}/);
  assert.match(page, /summary\?\.canPlaceOrder/);
  assert.match(page, /paymentMethod, idempotencyKey/);
  assert.match(page, /Online Payment/);
  assert.match(api, /initiateOnlineCheckout: \(data\) => api\.post\("\/payments\/online-checkouts", data\)/);
  assert.match(api, /getPaymentAttempt: \(id\) => api\.get\(/);
  assert.match(api, /confirmPaymentAttempt: \(id, mockOutcome\) => api\.post\(/);
  assert.match(api, /cancelPaymentAttempt: \(id\) => api\.post\(/);
  for (const label of ["TasteBridge Pay", "UPI ID / QR", "Card", "Net banking", "Wallet"]) assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(page, /Simulated checkout only/);
  assert.match(page, /No payment provider is contacted/);
  assert.doesNotMatch(page, /Direct simulation|Simulate Success|Simulate Failure/);
  assert.match(page, /Payment cancelled/);
  assert.match(page, /onConfirm={confirmOnlinePayment}/);
  assert.match(page, /finishOnlinePayment\(result\)/);
  assert.match(page, /setPaymentStage\("failure"\);\s*setPaymentError\(requestError\.message/);
  assert.match(page, /currentAttempt\.status === "PENDING"[\s\S]*?setPaymentStage\("gateway"\)/);
  assert.match(page, /The previous payment attempt could not be retrieved/);
  assert.match(page, /The payment attempt could not be found\. No order was created\./);
  assert.match(page, /order\?\.id/);
  assert.doesNotMatch(page, /name=["'](?:cardNumber|cvv|expiry)["']/i);
  assert.doesNotMatch(page, /localStorage.*(?:card|cvv|expiry)/i);
  assert.match(page, /address-management|Manage addresses/i);
  assert.doesNotMatch(page, /totalAmount\s*:/);
});

test("customer order history, confirmation, and detail routes are protected", async () => {
  const routes = await source("../src/routes/AppRoutes.jsx");
  for (const route of [
    /path="checkout" element=\{<ProtectedRoute><CheckoutPage \/><\/ProtectedRoute>\}/,
    /path="orders" element=\{<ProtectedRoute><CustomerOrdersPage \/><\/ProtectedRoute>\}/,
    /path="orders\/confirmation\/:id" element=\{<ProtectedRoute><CustomerOrderDetailPage confirmation \/><\/ProtectedRoute>\}/,
    /path="orders\/:id" element=\{<ProtectedRoute><CustomerOrderDetailPage \/><\/ProtectedRoute>\}/,
  ]) assert.match(routes, route);
});

test("customer order pages expose pending payment and multi-cook order information", async () => {
  const [history, details] = await Promise.all([
    source("../src/pages/CustomerOrdersPage.jsx"),
    source("../src/pages/CustomerOrderDetailPage.jsx"),
  ]);
  assert.match(history, /order\.cookName/);
  assert.match(history, /payment/);
  assert.match(details, /Cash on Delivery/);
  assert.match(details, /cancelUntil/);
  assert.match(details, /Live order status/);
  assert.match(details, /orderApi\.cancel/);
  assert.match(details, /checkout\.addressSnapshot/);
  assert.match(details, /order\.items/);
});
