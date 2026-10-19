import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPublicSocialContentService } from "../modules/cook/public-social-content.service.js";

const now = new Date("2026-10-19T12:00:00.000Z");
const eligibleIds = ["eligible-cook"];
const findEligibleCookIds = async () => eligibleIds;

test("public Posts query only published content from currently eligible Cooks, newest first, with safe fields and pagination", async () => {
  const calls = {};
  const db = {
    cookPost: {
      count: async ({ where }) => { calls.where = where; return 1; },
      findMany: async (args) => {
        calls.query = args;
        return [{
          id: "post-1", postType: "RECIPE", caption: "A recipe", publishedAt: now,
          cloudinaryPublicId: "must-not-appear",
          cook: { id: "eligible-cook", businessName: "Home Kitchen", profileImage: "photo", city: "Pune", locality: "Kothrud", email: "private" },
          media: [{ id: "media-1", mediaType: "IMAGE", mediaUrl: "https://cdn.example/photo.jpg", mediaMimeType: "image/jpeg", cloudinaryPublicId: "private-id", cloudinaryResourceType: "image", mediaBytes: 10, sortOrder: 0 }],
          dish: { id: "dish-1", name: "Dhokla", image: "dish-photo", cuisine: "Gujarati" },
          _count: { likes: 4, comments: 2 },
        }];
      },
    },
  };
  const service = createPublicSocialContentService(db, { now: () => now, findEligibleCookIds });
  const result = await service.listPosts({ page: 2, limit: 10, postType: "RECIPE", cuisine: "Gujarati" });

  assert.equal(calls.where.status, "PUBLISHED");
  assert.deepEqual(calls.where.publishedAt, { not: null, lte: now });
  assert.deepEqual(calls.where.media, { some: {} });
  assert.equal(calls.where.postType, "RECIPE");
  assert.deepEqual(calls.where.cook.is.cuisines, { has: "Gujarati" });
  assert.equal(calls.where.cook.is.id.in.includes("eligible-cook"), true);
  assert.deepEqual(calls.query.orderBy, [{ publishedAt: "desc" }, { id: "desc" }]);
  assert.equal(calls.query.skip, 10);
  assert.equal(calls.query.take, 10);
  assert.deepEqual(calls.query.select._count, { select: { likes: true, comments: { where: { deletedAt: null, moderationHiddenAt: null } } } });
  assert.equal(result.items[0].cook.email, undefined);
  assert.equal(result.items[0].media[0].cloudinaryPublicId, undefined);
  assert.equal(result.items[0].dish.name, "Dhokla");
  assert.equal(result.items[0].likeCount, 4);
  assert.equal(result.items[0].commentCount, 2);
  assert.deepEqual(result.pagination, { page: 2, limit: 10, total: 1, totalPages: 1 });
});

test("public Stories group one entry per Cook, exclude expired and future Stories, and order each Cook's Stories newest first", async () => {
  const calls = {};
  const db = {
    cookProfile: {
      count: async (args) => { calls.count = args; return 1; },
      findMany: async (args) => {
        calls.profiles = args;
        return [{
          id: "eligible-cook", businessName: "Home Kitchen", profileImage: "profile", city: "Pune", locality: "Kothrud", email: "private",
          socialStories: [
            { id: "story-new", mediaType: "IMAGE", mediaUrl: "public-url", publishedAt: now, expiresAt: new Date("2026-10-20T12:00:00Z"), cloudinaryPublicId: "private", dish: { id: "dish-1", name: "Dhokla" } },
          ],
        }];
      },
    },
    cookStory: {
      groupBy: async (args) => { calls.groups = args; return [{ cookId: "eligible-cook", _max: { publishedAt: now } }]; },
    },
  };
  const service = createPublicSocialContentService(db, { now: () => now, findEligibleCookIds });
  const result = await service.listStoryGroups({ page: 1, limit: 20 });

  assert.deepEqual(calls.count.where.socialStories.some.expiresAt, { gt: now });
  assert.deepEqual(calls.count.where.socialStories.some.publishedAt, { lte: now });
  assert.deepEqual(calls.groups.by, ["cookId"]);
  assert.deepEqual(calls.groups.orderBy, [{ _max: { publishedAt: "desc" } }, { cookId: "asc" }]);
  assert.deepEqual(calls.profiles.select.socialStories.where, { publishedAt: { lte: now }, expiresAt: { gt: now }, moderationHiddenAt: null });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].cook.email, undefined);
  assert.equal(result.items[0].stories[0].cloudinaryPublicId, undefined);
  assert.deepEqual(result.items[0].stories[0].dish, { id: "dish-1", name: "Dhokla" });
});

test("public feeds return empty pagination when no Cook passes the server-side eligibility check", async () => {
  let contentQueries = 0;
  const db = {
    cookStory: { count: async () => { contentQueries += 1; return 0; }, groupBy: async () => { contentQueries += 1; return []; } },
    cookPost: { count: async () => { contentQueries += 1; return 0; }, findMany: async () => { contentQueries += 1; return []; } },
  };
  const service = createPublicSocialContentService(db, { now: () => now, findEligibleCookIds: async () => [] });
  assert.deepEqual(await service.listPosts({ page: 1, limit: 20 }), { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  assert.deepEqual(await service.listStoryGroups({ page: 1, limit: 20 }), { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  assert.equal(contentQueries, 0);
});

test("public endpoints are unauthenticated reads and keep DishStory routes and model separate", async () => {
  const [routes, app, schema] = await Promise.all([
    readFile(new URL("../modules/cook/public-social-content.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../app.js", import.meta.url), "utf8"),
    readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8"),
  ]);
  assert.match(routes, /router\.get\("\/stories"/);
  assert.match(routes, /router\.get\("\/posts"/);
  assert.match(routes, /router\.get\("\/stories", validate\(publicStoriesSchema\), listPublicSocialStories\)/);
  assert.match(routes, /router\.get\("\/posts", validate\(publicPostsSchema\), listPublicSocialPosts\)/);
  assert.match(app, /app\.use\("\/api\/v1\/social", publicSocialContentRoutes\)/);
  assert.match(schema, /model DishStory\s*\{[\s\S]*?whoTaught[\s\S]*?storyText/);
});
