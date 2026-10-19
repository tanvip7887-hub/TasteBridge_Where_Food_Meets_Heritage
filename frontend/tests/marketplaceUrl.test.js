import assert from "node:assert/strict";
import test from "node:test";
import {
  marketplaceDetailLocation,
  marketplaceReturnLocation,
  readMarketplaceFilters,
  updateMarketplaceParams,
} from "../src/utils/marketplaceUrl.js";

test("marketplace filters are read from URL parameters with safe defaults", () => {
  assert.deepEqual(readMarketplaceFilters(new URLSearchParams()), {
    search: "",
    categoryId: "",
    sort: "newest",
    page: 1,
    type: "",
  });
  assert.deepEqual(readMarketplaceFilters(new URLSearchParams("search=dal&categoryId=cat1&sort=price_desc&page=3")), {
    search: "dal",
    categoryId: "cat1",
    sort: "price_desc",
    page: 3,
    type: "",
  });
});

test("invalid sort and page query values fall back safely", () => {
  const state = readMarketplaceFilters(new URLSearchParams("sort=raw&page=4e2"));
  assert.equal(state.sort, "newest");
  assert.equal(state.page, 1);
});

test("filter changes preserve unrelated query values and can reset pagination", () => {
  const current = new URLSearchParams("search=dal&page=4&type=order");
  const next = updateMarketplaceParams(current, "categoryId", "cat-2", { resetPage: true });
  assert.equal(next.get("search"), "dal");
  assert.equal(next.get("categoryId"), "cat-2");
  assert.equal(next.get("page"), null);
  assert.equal(next.get("type"), "order");
});

test("dish and return links retain marketplace context", () => {
  const params = new URLSearchParams("search=dal&categoryId=cat-2&sort=price_asc&page=2");
  assert.equal(
    marketplaceDetailLocation("dish/1", params),
    "/dishes/dish%2F1?search=dal&categoryId=cat-2&sort=price_asc&page=2"
  );
  assert.equal(
    marketplaceReturnLocation(params),
    "/explore?search=dal&categoryId=cat-2&sort=price_asc&page=2"
  );
});
