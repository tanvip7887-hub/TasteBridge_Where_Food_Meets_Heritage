import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createCookSocialContentService } from "../modules/cook/social-content.service.js";
import { hasValidSocialVideoSignature, SOCIAL_IMAGE_MAX_BYTES, SOCIAL_VIDEO_MAX_BYTES, SOCIAL_VIDEO_MAX_DURATION_SECONDS } from "../utils/socialMediaUpload.js";

const fixedNow = new Date("2026-10-19T12:00:00.000Z");
const ready = () => ({ readyToSell: true, pendingRequirements: [] });
const profile = { id: "cook-1", userId: "user-1", user: { status: "ACTIVE", activePortal: "COOK" } };

const makeDb = (overrides = {}) => {
  const calls = { storyCreate: [], postCreate: [], postUpdate: [], findPost: [], storyDeletes: [], postDeletes: [], dishFind: [], postList: [] };
  const db = {
    cookProfile: { findUnique: async () => profile },
    cookStory: {
      create: async ({ data }) => { calls.storyCreate.push(data); return { id: "story-1", ...data }; },
      findMany: async (args) => { calls.storyList = args; return []; },
      findFirst: async () => null,
      delete: async ({ where }) => { calls.storyDeletes.push(where); return { id: where.id, cloudinaryPublicId: "asset-1", cloudinaryResourceType: "image" }; },
      count: async () => 0,
    },
    cookPost: {
      create: async ({ data }) => { calls.postCreate.push(data); return { id: "post-1", ...data, media: [] }; },
      findMany: async (args) => { calls.postList.push(args); return []; },
      findFirst: async (args) => { calls.findPost.push(args); return overrides.post ?? null; },
      update: async (args) => { calls.postUpdate.push(args); return { id: args.where.id, ...args.data }; },
      delete: async ({ where }) => { calls.postDeletes.push(where); return { id: where.id, media: [] }; },
    },
    cookPostMedia: { count: async () => 0, deleteMany: async () => ({ count: 0 }), createMany: async () => ({ count: 0 }) },
    dish: { findFirst: async (args) => { calls.dishFind.push(args); return { id: args.where.id }; } },
    $transaction: async (callback) => callback(db),
    ...overrides.database,
  };
  return { db, calls };
};

const testFile = { buffer: Buffer.from("image"), size: 5, originalname: "kitchen.jpg", mimetype: "image/jpeg" };
const storage = {
  uploadPublicMarketplaceImage: async () => ({ publicId: "asset-1", secureUrl: "https://media.example/image.jpg", format: "jpg", bytes: 5 }),
  uploadPublicSocialVideo: async () => ({ publicId: "video-1", secureUrl: "https://media.example/video.mp4", format: "mp4", bytes: 12, duration: 25, resourceType: "video" }),
  deleteCloudinaryAsset: async () => ({ result: "ok" }),
};

test("Story publication derives the owner, sets server publication time, and expires exactly 24 hours later", async () => {
  const { db, calls } = makeDb();
  const service = createCookSocialContentService(db, { storage, readiness: ready, now: () => fixedNow });
  const story = await service.createStoryPhoto("cook-1", { caption: "Fresh from the kitchen" }, testFile);
  assert.equal(story.cookId, "cook-1");
  assert.equal(calls.storyCreate[0].publishedAt.toISOString(), fixedNow.toISOString());
  assert.equal(calls.storyCreate[0].expiresAt.toISOString(), "2026-10-20T12:00:00.000Z");
  assert.equal(calls.storyCreate[0].cloudinaryPublicId, "asset-1");
});

test("ineligible Cook cannot publish and the media provider is not called", async () => {
  const { db } = makeDb();
  let uploads = 0;
  const service = createCookSocialContentService(db, {
    storage: { ...storage, uploadPublicMarketplaceImage: async () => { uploads += 1; } },
    readiness: () => ({ readyToSell: false, pendingRequirements: [{ label: "Selling approval" }] }),
  });
  await assert.rejects(service.createStoryPhoto("cook-1", {}, testFile), /not eligible to publish/);
  await assert.rejects(service.createDraft("cook-1", { postType: "RECIPE" }), /not eligible to publish/);
  assert.equal(uploads, 0);
});

test("Post drafts remain unpublished; a photo Post publishes directly with stored media metadata", async () => {
  const { db, calls } = makeDb();
  const service = createCookSocialContentService(db, { storage, readiness: ready, now: () => fixedNow });
  await service.createDraft("cook-1", { postType: "RECIPE", caption: "Work in progress" });
  assert.equal(calls.postCreate[0].status, "DRAFT");
  assert.equal(calls.postCreate[0].publishedAt, undefined);
  await service.createPhotoPost("cook-1", { postType: "PHOTO", status: "PUBLISHED", caption: "Lunch" }, [testFile]);
  assert.equal(calls.postCreate[1].status, "PUBLISHED");
  assert.equal(calls.postCreate[1].publishedAt.toISOString(), fixedNow.toISOString());
  assert.equal(calls.postCreate[1].media.create[0].cloudinaryPublicId, "asset-1");
});

test("Post edit and delete queries are scoped to the authenticated Cook owner", async () => {
  const { db, calls } = makeDb();
  const service = createCookSocialContentService(db, { storage, readiness: ready });
  await assert.rejects(service.updatePost("cook-1", "someone-elses-post", { caption: "Changed" }), /not found/);
  assert.deepEqual(calls.findPost[0].where, { id: "someone-elses-post", cookId: "cook-1" });
  await assert.rejects(service.deletePost("cook-1", "someone-elses-post"), /not found/);
  assert.equal(calls.postDeletes.length, 0);
});

test("a moderated hidden Post cannot be republished through the Cook edit endpoint", async () => {
  const { db, calls } = makeDb({ post: { id: "hidden-post", cookId: "cook-1", status: "DRAFT", moderationHiddenAt: fixedNow, media: [{ id: "media-1" }] } });
  const service = createCookSocialContentService(db, { storage, readiness: ready, now: () => fixedNow });
  await assert.rejects(service.updatePost("cook-1", "hidden-post", { status: "PUBLISHED" }), /hidden by moderation/);
  assert.equal(calls.postUpdate.length, 0);
});

test("Cook Post list remains owner-scoped and includes private-safe like and active comment counts", async () => {
  const { db, calls } = makeDb();
  const service = createCookSocialContentService(db, { storage, readiness: ready });
  await service.listPosts("cook-1", "PUBLISHED");
  assert.deepEqual(calls.postList[0].where, { cookId: "cook-1", status: "PUBLISHED" });
  assert.deepEqual(calls.postList[0].include._count, { select: { likes: true, comments: { where: { deletedAt: null } } } });
});

test("media limits and video signatures enforce supported formats and 60-second cap", () => {
  assert.equal(SOCIAL_IMAGE_MAX_BYTES, 5 * 1024 * 1024);
  assert.equal(SOCIAL_VIDEO_MAX_BYTES, 25 * 1024 * 1024);
  assert.equal(SOCIAL_VIDEO_MAX_DURATION_SECONDS, 60);
  assert.equal(hasValidSocialVideoSignature("video/mp4", Buffer.from("0000ftypisom")), true);
  assert.equal(hasValidSocialVideoSignature("video/mp4", Buffer.from("not a video")), false);
});

test("overlong provider-verified video is rejected and its unused asset is deleted", async () => {
  const { db } = makeDb();
  const deleted = [];
  const service = createCookSocialContentService(db, {
    readiness: ready,
    storage: {
      ...storage,
      uploadPublicSocialVideo: async () => ({ publicId: "long-video", secureUrl: "https://media.example/video.mp4", duration: 61, resourceType: "video" }),
      deleteCloudinaryAsset: async (...args) => { deleted.push(args); },
    },
  });
  await assert.rejects(service.createStoryVideo("cook-1", {}, { ...testFile, mimetype: "video/mp4" }), /60 seconds or shorter/);
  assert.deepEqual(deleted, [["long-video", "video", "upload"]]);
});

test("photo Post enforces the five-photo maximum before uploading", async () => {
  const { db } = makeDb();
  let uploads = 0;
  const service = createCookSocialContentService(db, {
    readiness: ready,
    storage: { ...storage, uploadPublicMarketplaceImage: async () => { uploads += 1; return storage.uploadPublicMarketplaceImage(); } },
  });
  await assert.rejects(service.createPhotoPost("cook-1", { postType: "PHOTO" }, Array.from({ length: 6 }, () => testFile)), /between 1 and 5 photos/);
  assert.equal(uploads, 0);
});

test("Cook social routes require approved Cook authorization and DishStory remains separate", async () => {
  const routes = await readFile(new URL("../modules/cook/cook.routes.js", import.meta.url), "utf8");
  const schema = await readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(routes, /router\.use\(authenticate\)/);
  assert.match(routes, /router\.post\("\/social\/stories\/photos", requireApprovedCook/);
  assert.match(routes, /router\.post\("\/social\/posts\/videos", requireApprovedCook/);
  assert.match(routes, /router\.get\("\/social\/comments", requireApprovedCook, validate\(listCookPostCommentsSchema\), listMyPostComments\)/);
  assert.match(schema, /model DishStory\s*\{[\s\S]*?whoTaught[\s\S]*?storyText/);
  assert.match(schema, /model CookStory\s*\{/);
  assert.match(schema, /model CookPost\s*\{/);
});
