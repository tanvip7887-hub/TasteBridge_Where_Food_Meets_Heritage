import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { moveStoryPosition, normalizeStoryGroups } from "../src/utils/socialFeed.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const current = Date.parse("2026-10-19T12:00:00Z");
const story = (id, expiresAt = "2026-10-19T13:00:00Z") => ({ id, mediaUrl: `https://cdn.example/${id}`, publishedAt: "2026-10-19T11:00:00Z", expiresAt });

test("active Stories are grouped once per Cook and expired or unavailable media is removed", () => {
  const groups = normalizeStoryGroups([
    { cook: { id: "cook-1" }, stories: [story("new"), story("expired", "2026-10-19T11:00:00Z"), { ...story("no-media"), mediaUrl: "" }] },
    { cook: { id: "cook-1" }, stories: [story("second")] },
    { cook: { id: "cook-2" }, stories: [] },
  ], current);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].cook.id, "cook-1");
  assert.deepEqual(groups[0].stories.map(({ id }) => id), ["new", "second"]);
});

test("Story viewer advances within a Cook then to the next Cook and supports previous navigation", () => {
  const groups = [
    { stories: [story("one"), story("two")] },
    { stories: [story("three")] },
  ];
  assert.deepEqual(moveStoryPosition(groups, { groupIndex: 0, storyIndex: 0 }, 1, current), { groupIndex: 0, storyIndex: 1 });
  assert.deepEqual(moveStoryPosition(groups, { groupIndex: 0, storyIndex: 1 }, 1, current), { groupIndex: 1, storyIndex: 0 });
  assert.deepEqual(moveStoryPosition(groups, { groupIndex: 1, storyIndex: 0 }, -1, current), { groupIndex: 0, storyIndex: 1 });
});

test("Story viewer skips newly expired Stories and ends cleanly at the final Story", () => {
  const groups = [{ stories: [story("expired", "2026-10-19T11:59:59Z"), story("active")] }];
  assert.deepEqual(moveStoryPosition(groups, { groupIndex: 0, storyIndex: 0 }, 1, current), { groupIndex: 0, storyIndex: 1 });
  assert.equal(moveStoryPosition(groups, { groupIndex: 0, storyIndex: 1 }, 1, current), null);
});

test("Customer Stories card navigates to a public Stories route with public APIs", async () => {
  const [home, routes, page, api] = await Promise.all([
    read("../src/pages/HomePage.jsx"),
    read("../src/routes/AppRoutes.jsx"),
    read("../src/pages/StoriesPage.jsx"),
    read("../src/api/socialApi.js"),
  ]);
  assert.match(home, /title: "Stories"[^\n]*to: "\/stories"/);
  assert.match(routes, /<Route element=\{<MainLayout \/>\}>\s*<Route path="\/stories" element=\{<StoriesPage \/>\} \/>\s*<\/Route>/);
  const customerRouteTree = routes.split("{/* Main Customer / Storefront Layout */}")[1].split("{/* Fallback Route */}")[0];
  assert.doesNotMatch(customerRouteTree, /path="stories"/);
  assert.match(page, /listPublicStories/);
  assert.match(page, /listPublicPosts/);
  assert.match(page, /AbortController/);
  assert.match(api, /"\/social\/stories"/);
  assert.match(api, /"\/social\/posts"/);
});

test("Stories remain available through their page entry points without a Navbar link", async () => {
  const navbar = await read("../src/components/layout/Navbar.jsx");
  assert.doesNotMatch(navbar, /to="\/stories"/);
  assert.doesNotMatch(navbar, /routerLocation\.pathname === "\/stories"/);
});

