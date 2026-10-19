import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Cook dish form offers draft and Admin review submission but no direct publishing action", async () => {
  const source = await read("../src/pages/cook/panel/DishFormModal.jsx");
  assert.match(source, /handleSubmit\("DRAFT"\)/);
  assert.match(source, /handleSubmit\("PENDING_APPROVAL"\)/);
  assert.doesNotMatch(source, /handleSubmit\("PUBLISHED"\)/);
  assert.doesNotMatch(source, /Publish to Menu|Save & Update/);
  assert.match(source, /It will stay hidden from customers until approved/);
});

test("Cook dashboard exposes unpublish only for published listings and routes other listings to review", async () => {
  const source = await read("../src/pages/cook/panel/CookDishesPage.jsx");
  assert.match(source, /dish\.status === "PUBLISHED"[\s\S]*?Unpublish/);
  assert.match(source, /Edit &amp; submit for Admin review/);
  assert.doesNotMatch(source, /cookApi\.publishDish\(/);
});

test("Admin moderation offers approval and rejection only for pending dishes", async () => {
  const source = await read("../src/pages/admin/AdminDishes.jsx");
  assert.equal((source.match(/dish\.status === "PENDING_APPROVAL" && \(/g) || []).length, 3);
  assert.match(source, /Approve & Publish/);
  assert.match(source, /Reject Listing/);
});
