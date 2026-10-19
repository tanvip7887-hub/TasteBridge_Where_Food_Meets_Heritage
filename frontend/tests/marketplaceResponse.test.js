import assert from "node:assert/strict";
import test from "node:test";
import { marketplaceListingView, readMarketplaceListing } from "../src/utils/marketplaceResponse.js";

test("marketplace reads the public API envelope produced by the API client", () => {
  const listing = { items: [{ id: "dish-1", name: "Idli" }], pagination: { page: 1, total: 1, totalPages: 1 } };
  assert.deepEqual(readMarketplaceListing({ success: true, data: listing }), listing);
});

test("marketplace treats an empty API listing as an empty state", () => {
  const listing = readMarketplaceListing({ success: true, data: { items: [], pagination: { page: 1, total: 0, totalPages: 0 } } });
  assert.equal(marketplaceListingView({ pending: false, error: "", items: listing.items }), "empty");
});

test("marketplace exposes a recoverable error state and rejects malformed API responses", () => {
  assert.equal(marketplaceListingView({ pending: false, error: "Network error", items: [] }), "error");
  assert.throws(() => readMarketplaceListing({ success: true, data: { dishes: [] } }), /unexpected response/);
});

test("pending requests and populated results select their corresponding views", () => {
  assert.equal(marketplaceListingView({ pending: true, error: "", items: [] }), "loading");
  assert.equal(marketplaceListingView({ pending: false, error: "", items: [{ id: "dish-1" }] }), "results");
});
