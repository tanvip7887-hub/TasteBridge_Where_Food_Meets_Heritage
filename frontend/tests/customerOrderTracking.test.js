import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("customer tracking includes persisted ready-for-pickup status and recorded progress times", async () => {
  const page = await readFile(new URL("../src/pages/CustomerOrderDetailPage.jsx", import.meta.url), "utf8");
  const service = await readFile(new URL("../../backend/src/modules/orders/orders.service.js", import.meta.url), "utf8");
  assert.match(page, /\["READY_FOR_PICKUP", "Ready for pickup"\]/);
  assert.match(page, /order\.statusHistory/);
  assert.match(page, /dateTime=\{changedAt\}/);
  assert.match(service, /statusHistory: \{ orderBy: \[\{ changedAt: "asc" \}, \{ id: "asc" \}\] \}/);
  assert.match(service, /recordOrderStatus\(tx, \{ orderId: createdOrder\.id, toStatus: "PENDING" \}\)/);
});

test("receipt confirmation is offered only for delivered, unconfirmed orders and uses the authenticated order API", async () => {
  const page = await readFile(new URL("../src/pages/CustomerOrderDetailPage.jsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../src/api/orderApi.js", import.meta.url), "utf8");
  assert.match(page, /order\.status === "DELIVERED" && <div className="mt-4 border-t/);
  assert.match(page, /order\.customerReceivedAt \? <p[^>]*>Order Received/);
  assert.match(page, /Confirm Order Received/);
  assert.match(page, /window\.confirm\("Confirm that you received this order\?"\)/);
  assert.match(page, /orderApi\.confirmReceipt\(order\.id\)/);
  assert.match(page, /The server did not confirm receipt/);
  assert.match(api, /confirmReceipt: \(id\) => api\.post\(`\/orders\/\$\{encodeURIComponent\(id\)\}\/receipt-confirmation`\)/);
});

test("history hiding is presented only for delivered orders and confirmed by backend response", async () => {
  const history = await readFile(new URL("../src/pages/CustomerOrdersPage.jsx", import.meta.url), "utf8");
  const service = await readFile(new URL("../../backend/src/modules/orders/orders.service.js", import.meta.url), "utf8");
  assert.match(history, /order\.status === "DELIVERED" && <button[\s\S]*?Hide from Order History/);
  assert.match(history, /orderApi\.hideFromHistory\(order\.id\)/);
  assert.match(history, /response\.data\.hiddenFromCustomerAt/);
  assert.match(service, /where: \{ customerId, checkoutId: null, hiddenFromCustomerAt: null \}/);
  assert.match(service, /orders: customerCheckout\.orders\?\.filter\(\(order\) => !order\.hiddenFromCustomerAt\)/);
  assert.match(service, /Only delivered orders can be hidden from your order history/);
});
