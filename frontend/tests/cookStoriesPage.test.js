import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Cook Stories route replaces the old placeholder while preserving the existing route", async () => {
  const routes = await read("../src/routes/AppRoutes.jsx");
  assert.match(routes, /path="stories" element=\{<CookStoriesPage \/>\}/);
  assert.doesNotMatch(routes, /path="stories"[\s\S]{0,300}CookPlaceholderPage/);
});

test("Cook My Stories page has a single Your Story entry and Add post action", async () => {
  const [page, api] = await Promise.all([read("../src/pages/cook/panel/CookStoriesPage.jsx"), read("../src/api/cookApi.js")]);
  for (const label of ["Posts", "Active stories", "Drafts", "Comments", "Your Story", "Add post"]) assert.ok(page.includes(label), `missing ${label}`);
  assert.doesNotMatch(page, /Add story/);
  assert.equal((page.match(/>Your Story<\/span>/g) || []).length, 1, "there is one visible Your Story control");
  assert.doesNotMatch(page, /aria-label="Your Story"/);
  assert.match(page, /Comments on your Posts/);
  assert.match(page, /getSocialComments/);
  assert.match(api, /"\/cooks\/social\/comments"/);
  assert.match(page, /Stories expire 24 hours after sharing/);
  assert.match(page, /remaining/);
  assert.doesNotMatch(page, /story\.viewCount/);
});

test("Composer supports the required media variants and publish/draft/edit/delete actions", async () => {
  const page = await read("../src/pages/cook/panel/CookStoriesPage.jsx");
  for (const type of ["PHOTO", "VIDEO", "RECIPE", "HERITAGE_STORY"]) assert.ok(page.includes(type));
  assert.match(page, /Photos \(up to 5, each up to 5 MB\)/);
  assert.match(page, /up to 60 seconds/);
  assert.match(page, /Save as draft/);
  assert.match(page, /Publish Post/);
  assert.match(page, /Edit/);
  assert.match(page, /deleteSocialPost/);
  assert.match(page, /post\._count\?\.likes/);
  assert.match(page, /post\._count\?\.comments/);
  assert.match(page, /createPostComment/);
  assert.match(page, /deletePostComment/);
  assert.match(page, /item\.canDelete &&/);
});

test("Cook social APIs use authenticated cook-scoped endpoints without accepting a Cook ID", async () => {
  const api = await read("../src/api/cookApi.js");
  for (const endpoint of ["/cooks/social/stories", "/cooks/social/posts"]) assert.ok(api.includes(endpoint));
  assert.doesNotMatch(api, /cookId\s*:/);
});
