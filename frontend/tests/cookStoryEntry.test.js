import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { activeStoriesForCook, findPublicStoryGroupForCook, ownStoryViewerPath } from "../src/utils/cookStoryEntry.js";

const now = Date.parse("2026-10-19T12:00:00.000Z");
const activeStory = (id, overrides = {}) => ({
  id,
  mediaUrl: `https://media.example/${id}`,
  mediaType: id === "video" ? "VIDEO" : "IMAGE",
  publishedAt: "2026-10-19T11:00:00.000Z",
  expiresAt: "2026-10-20T11:00:00.000Z",
  ...overrides,
});

test("Your Story is empty when no publicly visible active group exists", () => {
  assert.deepEqual(activeStoriesForCook(null, "cook-1", now), []);
  assert.deepEqual(activeStoriesForCook({ cook: { id: "cook-1" }, stories: [] }, "cook-1", now), []);
  assert.deepEqual(activeStoriesForCook({ cook: { id: "cook-2" }, stories: [activeStory("other")] }, "cook-1", now), []);
});

test("active photo and video Stories are available only for the matching Cook", () => {
  const group = { cook: { id: "cook-1" }, stories: [activeStory("video"), activeStory("photo")] };
  assert.deepEqual(activeStoriesForCook(group, "cook-1", now).map(({ id }) => id), ["video", "photo"]);
});

test("expired and media-less/deleted Stories do not keep the own Story ring active", () => {
  const group = { cook: { id: "cook-1" }, stories: [
    activeStory("expired", { expiresAt: "2026-10-19T11:59:59.000Z" }),
    activeStory("deleted", { mediaUrl: null }),
  ] };
  assert.deepEqual(activeStoriesForCook(group, "cook-1", now), []);
});

test("hidden or deleted Stories absent from the public feed resolve to the empty state", async () => {
  const group = await findPublicStoryGroupForCook("cook-1", async () => ({ data: { data: { items: [], pagination: { totalPages: 1 } } } }));
  assert.equal(group, null);
  assert.deepEqual(activeStoriesForCook(group, "cook-1", now), []);
});

test("public visibility lookup follows pagination until it finds the Cook or exhausts pages", async () => {
  const pages = [
    { data: { data: { items: [{ cook: { id: "cook-2" }, stories: [activeStory("other")] }], pagination: { totalPages: 2 } } } },
    { data: { data: { items: [{ cook: { id: "cook-1" }, stories: [activeStory("mine")] }], pagination: { totalPages: 2 } } } },
  ];
  const requested = [];
  const found = await findPublicStoryGroupForCook("cook-1", async (page) => { requested.push(page); return pages[page - 1]; });
  assert.deepEqual(requested, [1, 2]);
  assert.equal(found.cook.id, "cook-1");
});

test("own Story action deep-links to the existing public Stories viewer", async () => {
  assert.equal(ownStoryViewerPath("cook / 1", "story?2"), "/stories?cookId=cook%20%2F%201&storyId=story%3F2");
  const [viewerPage, cookPage] = await Promise.all([
    readFile(new URL("../src/pages/StoriesPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/cook/panel/CookStoriesPage.jsx", import.meta.url), "utf8"),
  ]);
  assert.ok(cookPage.indexOf("Your Story") < cookPage.indexOf("aria-label=\"My Stories sections\""));
  assert.match(cookPage, /aria-label=\{ownStoryChecking \? "Checking your Story" : ownActiveStory \? "View your active Story" : "Add to Your Story"\}/);
  assert.doesNotMatch(cookPage, /ImagePlus|Add story/);
  assert.match(cookPage, /Could not check Story visibility\. Use Refresh to try again\./);
  assert.match(cookPage, /navigate\(ownStoryViewerPath\(cookId, ownActiveStory\.id\), \{ state:/);
  assert.match(cookPage, /state: \{ returnTo: "\/cook\/stories" \}/);
  assert.match(viewerPage, /useSearchParams/);
  assert.match(viewerPage, /location\.state\?\.returnTo === "\/cook\/stories"/);
  assert.match(viewerPage, /navigate\(-1\)/);
  assert.match(viewerPage, /requestedCookId/);
  assert.match(viewerPage, /setViewer\(\{ cookId: requestedCookId, storyId: target.id \}\)/);
  assert.match(viewerPage, /mediaType === "VIDEO" \? <video/);
});
