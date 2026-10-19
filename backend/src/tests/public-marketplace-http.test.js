import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import app from "../app.js";

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

test("public discovery routes reach validation without authentication", async () => {
  const listing = await fetch(`${baseUrl}/api/v1/dishes?sort=invalid`);
  const listingBody = await listing.json();
  assert.equal(listing.status, 400);
  assert.equal(listingBody.success, false);
  assert.equal(listingBody.message, "Validation failed");

  const detail = await fetch(`${baseUrl}/api/v1/dishes/invalid%2Fid`);
  const detailBody = await detail.json();
  assert.equal(detail.status, 400);
  assert.equal(detailBody.success, false);
  assert.equal(detailBody.message, "Validation failed");
});

test("public listing accepts validated pagination and returns the response contract without authentication", async () => {
  const response = await fetch(`${baseUrl}/api/v1/dishes?page=1&limit=1`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.data.items));
  assert.equal(body.data.pagination.page, 1);
  assert.equal(body.data.pagination.limit, 1);
  assert.ok(Number.isInteger(body.data.pagination.total));
  assert.ok(Number.isInteger(body.data.pagination.totalPages));
});
