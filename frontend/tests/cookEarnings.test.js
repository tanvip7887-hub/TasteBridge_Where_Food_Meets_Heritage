import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { omitEmptyEarningsFilters } from "../src/api/cookApi.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("cook earnings UI uses real API data and distinguishes collection from settlement", async () => {
  const [page, api] = await Promise.all([
    read("../src/pages/cook/panel/CookEarningsPage.jsx"),
    read("../src/api/cookApi.js"),
  ]);
  assert.match(api, /getEarnings: \(params\) => api\.get\("\/cooks\/earnings", \{ params: omitEmptyEarningsFilters\(params\) \}\)/);
  assert.match(page, /cookApi\.getEarnings\(\{ page, pageSize: 20, \.\.\.filters \}\)/);
  assert.match(page, /awaitingCodCollection/);
  assert.match(page, /Payout settlement/);
  assert.match(page, /role="alert"/);
  assert.match(page, /Loading earnings/);
  assert.match(page, /No matching order earnings/);
  assert.match(page, /This month/);
  assert.match(page, /Last month/);
  assert.match(page, /platformCommission/);
  assert.match(page, /Search order or booking reference/);
  assert.match(page, /Filter by order status/);
  assert.match(page, /Filter by payment status/);
  assert.match(page, /hasNextPage/);
  assert.match(page, /REFUNDED/);
  assert.match(page, /payout settlement is not tracked/i);
  assert.match(page, /How earnings are counted/);
  assert.match(page, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(page, /title: "Food Orders"/);
  assert.match(page, /title: "Dining"/);
  assert.match(page, /title: "Workshops"/);
  assert.match(page, /Not tracked/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /md:hidden/);
});

test("earnings API omits unset enum filters so the backend can apply defaults", () => {
  assert.deepEqual(omitEmptyEarningsFilters({
    page: 1, pageSize: 20, search: "", status: "", paymentStatus: "", period: "ALL",
  }), { page: 1, pageSize: 20, search: "", period: "ALL" });
  assert.deepEqual(omitEmptyEarningsFilters({ status: "DELIVERED", paymentStatus: "PAID" }), {
    status: "DELIVERED", paymentStatus: "PAID",
  });
});
