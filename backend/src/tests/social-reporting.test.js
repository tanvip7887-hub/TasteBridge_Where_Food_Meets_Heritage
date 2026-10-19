import assert from "node:assert/strict";
import test from "node:test";
import { createSocialReportingService } from "../modules/cook/social-reporting.service.js";
import { createPublicSocialContentService } from "../modules/cook/public-social-content.service.js";
import { requireRole } from "../middlewares/auth.js";

const time = new Date("2026-10-19T12:00:00.000Z");
const customer = { id: "customer-1", role: "CUSTOMER", activePortal: "CUSTOMER", status: "ACTIVE" };
const eligibleIds = async () => ["cook-1"];

const makeReportDb = (overrides = {}) => {
  const calls = { report: null, moderation: null, update: null, audit: null };
  const tx = {
    cookPost: {
      findFirst: async () => ({ id: "post-1" }),
      findUnique: async () => ({ id: "post-1" }),
      update: async (args) => { calls.update = args; return args; },
    },
    cookStory: { findFirst: async () => ({ id: "story-1" }), findUnique: async () => ({ id: "story-1" }), update: async (args) => { calls.update = args; return args; } },
    cookPostComment: { findFirst: async () => ({ id: "comment-1" }), findUnique: async () => ({ id: "comment-1", deletedAt: null }), update: async (args) => { calls.update = args; return args; } },
    socialContentReport: {
      findFirst: async () => null,
      create: async (args) => { calls.report = args; return { id: "report-1", status: "PENDING", ...args.data }; },
      findUnique: async () => ({ id: "report-1", status: "PENDING", targetType: "POST", targetId: "post-1" }),
      update: async ({ data }) => ({ id: "report-1", ...data }),
    },
    socialModerationAction: { create: async ({ data }) => { calls.audit = data; return data; } },
    ...overrides,
  };
  const db = { ...tx, $transaction: async (callback) => callback(tx) };
  return { db, calls };
};

test("guests and non-customers cannot report; active customer reports a validated target with session-derived identity", async () => {
  const { db, calls } = makeReportDb();
  const service = createSocialReportingService(db, { now: () => time, findEligibleCookIds: eligibleIds });
  await assert.rejects(service.createReport(null, { targetType: "POST", targetId: "post-1", reason: "SPAM" }), /Authentication required/);
  await assert.rejects(service.createReport({ ...customer, role: "COOK" }, { targetType: "POST", targetId: "post-1", reason: "SPAM" }), /Only active customers/);
  await service.createReport(customer, { targetType: "POST", targetId: "post-1", reason: "SPAM", explanation: "  Repeated unwanted material  " });
  assert.equal(calls.report.data.reporterId, customer.id);
  assert.equal(calls.report.data.postId, "post-1");
  assert.equal(calls.report.data.explanation, "Repeated unwanted material");
});

test("report target type and explanation are validated and duplicate pending reports are rejected", async () => {
  const { db } = makeReportDb({
    socialContentReport: {
      findFirst: async () => ({ id: "existing" }),
      create: async () => assert.fail("duplicate report must not be inserted"),
    },
  });
  const service = createSocialReportingService(db, { now: () => time, findEligibleCookIds: eligibleIds });
  await assert.rejects(service.createReport(customer, { targetType: "STORY", targetId: "post-1", reason: "SPAM", explanation: "x".repeat(501) }), /500 characters/);
  await assert.rejects(service.createReport(customer, { targetType: "POST", targetId: "post-1", reason: "SPAM" }), /already reported/);
});

test("reported content must be currently public and eligible", async () => {
  const { db } = makeReportDb({ cookPost: { findFirst: async () => null } });
  const service = createSocialReportingService(db, { now: () => time, findEligibleCookIds: eligibleIds });
  await assert.rejects(service.createReport(customer, { targetType: "POST", targetId: "hidden-post", reason: "OTHER" }), /unavailable/);
});

test("Admin hide action sets the hidden timestamp and records the authenticated Admin and reason", async () => {
  const { db, calls } = makeReportDb();
  const service = createSocialReportingService(db, { now: () => time });
  await service.moderateReport("admin-1", "report-1", { action: "HIDE", reason: "Violates community rules." });
  assert.deepEqual(calls.update, { where: { id: "post-1" }, data: { moderationHiddenAt: time } });
  assert.equal(calls.audit.adminUserId, "admin-1");
  assert.equal(calls.audit.action, "HIDE_POST");
  assert.equal(calls.audit.reason, "Violates community rules.");
});

test("Admin cannot process the same report twice or submit an unauditable reason", async () => {
  const { db } = makeReportDb({ socialContentReport: { findUnique: async () => ({ id: "report-1", status: "ACTION_TAKEN", targetType: "POST", targetId: "post-1" }) } });
  const service = createSocialReportingService(db);
  await assert.rejects(service.moderateReport("admin-1", "report-1", { action: "HIDE", reason: "Valid reason" }), /no longer pending/);
  await assert.rejects(service.moderateReport("admin-1", "report-1", { action: "HIDE", reason: "  " }), /reason between 5 and 500/);
});

test("Admin authorization middleware rejects non-Admins and allows an authenticated Admin", () => {
  const guard = requireRole("ADMIN");
  let denied;
  guard({ user: { role: "CUSTOMER" } }, {}, (error) => { denied = error; });
  assert.equal(denied.statusCode, 403);
  let allowed = false;
  guard({ user: { role: "ADMIN" } }, {}, (error) => { assert.equal(error, undefined); allowed = true; });
  assert.equal(allowed, true);
});

test("public Posts and Stories query only moderation-visible social content", async () => {
  const calls = {};
  const db = {
    cookProfile: { count: async () => 0, findMany: async () => [] },
    cookStory: { groupBy: async ({ where }) => { calls.storyWhere = where; return []; } },
    cookPost: { count: async ({ where }) => { calls.postWhere = where; return 0; }, findMany: async () => [] },
  };
  const service = createPublicSocialContentService(db, { now: () => time, findEligibleCookIds: eligibleIds });
  await service.listPosts({ page: 1, limit: 10 });
  await service.listStoryGroups({ page: 1, limit: 10 });
  assert.equal(calls.postWhere.moderationHiddenAt, null);
  assert.equal(calls.storyWhere.moderationHiddenAt, null);
});
