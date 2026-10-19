import assert from "node:assert/strict";
import test from "node:test";
import { persistCookFssaiTransition } from "../modules/admin/admin.service.js";
import { notifyCookFssaiReview } from "../modules/notifications/fssai-review.producers.js";

const initial = () => ({
  cook: { id: "cook-1", userId: "user-1", fssaiStatus: "SUBMITTED", isApprovedToSell: false, fssaiRejectionReason: null },
  document: { id: "doc-1", userId: "user-1", documentType: "FSSAI_LICENSE", documentUrl: "private://doc", cloudinaryPublicId: "asset-1", mimeType: "application/pdf", verificationStatus: "PENDING" },
  notifications: [], sharedNotifications: [],
});

const makeClient = (state, failNotification = false, failSharedNotification = false) => ({
  async $transaction(callback) {
    const working = structuredClone(state);
    const tx = {
      verificationDocument: {
        async findUnique() { return working.document; },
        async findFirst() { return { id: working.document.id }; },
        async updateMany({ where, data }) {
          if (working.document.id !== where.id || working.document.verificationStatus !== where.verificationStatus) return { count: 0 };
          Object.assign(working.document, data);
          return { count: 1 };
        },
      },
      cookProfile: { async update({ data }) { Object.assign(working.cook, data); return working.cook; } },
      cookNotification: { async create({ data }) { if (failNotification) throw new Error("notification failure"); working.notifications.push(data); } },
      userNotification: { async upsert({ create }) {
        if (failSharedNotification) throw new Error("shared notification failure");
        let row = working.sharedNotifications.find((item) => item.eventKey === create.eventKey && item.userId === create.userId && item.portal === create.portal);
        if (!row) { row = structuredClone(create); working.sharedNotifications.push(row); }
        return row;
      } },
    };
    const result = await callback(tx);
    Object.assign(state.cook, working.cook);
    Object.assign(state.document, working.document);
    state.notifications = working.notifications;
    state.sharedNotifications = working.sharedNotifications;
    return result;
  },
});

test("FSSAI approval updates the document, profile, expiry and cook notification transactionally", async () => {
  const state = initial();
  await persistCookFssaiTransition(makeClient(state), { ...state.cook }, {
    action: "APPROVE", documentId: "doc-1", fssaiExpiryDate: "2027-03-04",
  });
  assert.equal(state.document.verificationStatus, "APPROVED");
  assert.equal(state.cook.fssaiStatus, "APPROVED");
  assert.equal(state.cook.isApprovedToSell, false);
  assert.equal(state.cook.fssaiExpiryDate.toISOString(), "2027-03-04T23:59:59.999Z");
  assert.equal(state.document.expiryDate.toISOString(), "2027-03-04T23:59:59.999Z");
  assert.equal(state.notifications[0].metadata.fssaiStatus, "APPROVED");
  assert.deepEqual(state.sharedNotifications.map(({ userId, portal, type, metadata }) => [userId, portal, type, metadata.fssaiStatus, metadata.documentId]), [
    ["user-1", "COOK", "VERIFICATION_ALERT", "APPROVED", "doc-1"],
  ]);
  assert.equal(state.sharedNotifications[0].metadata.eventKey, state.notifications[0].metadata.eventKey);
});

test("FSSAI rejection stores the reason and notifies the cook", async () => {
  const state = initial();
  await persistCookFssaiTransition(makeClient(state), { ...state.cook }, {
    action: "REJECT", documentId: "doc-1", rejectionReason: "Document is unreadable",
  });
  assert.equal(state.document.verificationStatus, "REJECTED");
  assert.equal(state.cook.fssaiStatus, "REJECTED");
  assert.equal(state.cook.fssaiRejectionReason, "Document is unreadable");
  assert.match(state.notifications[0].message, /Document is unreadable/);
  assert.equal(state.sharedNotifications[0].metadata.fssaiStatus, "REJECTED");
  assert.equal(state.sharedNotifications[0].userId, "user-1");
  assert.equal(state.sharedNotifications[0].portal, "COOK");
});

test("requesting a new certificate preserves the reason and requires replacement review", async () => {
  const state = initial();
  await persistCookFssaiTransition(makeClient(state), { ...state.cook }, {
    action: "REQUEST_NEW_DOCUMENT", documentId: "doc-1", rejectionReason: "Expiry date is unreadable",
  });
  assert.equal(state.document.verificationStatus, "NEEDS_REVISION");
  assert.equal(state.cook.fssaiStatus, "REJECTED");
  assert.equal(state.cook.fssaiRejectionReason, "Expiry date is unreadable");
  assert.match(state.notifications[0].message, /Expiry date is unreadable/);
  assert.equal(state.sharedNotifications[0].metadata.fssaiStatus, "NEEDS_REVISION", "shared status reflects the persisted document outcome");
  assert.equal(state.notifications[0].metadata.fssaiStatus, "REJECTED", "legacy status representation remains unchanged");
});

test("failed FSSAI notification rolls back document and profile review changes", async () => {
  const state = initial();
  await assert.rejects(persistCookFssaiTransition(makeClient(state, true), { ...state.cook }, {
    action: "REJECT", documentId: "doc-1", rejectionReason: "Invalid document",
  }), /notification failure/);
  assert.deepEqual(state, initial());
});

test("failed shared notification rolls back the review and legacy notification in the same transaction", async () => {
  const state = initial();
  await assert.rejects(persistCookFssaiTransition(makeClient(state, false, true), { ...state.cook }, {
    action: "APPROVE", documentId: "doc-1", fssaiExpiryDate: "2027-03-04",
  }), /shared notification failure/);
  assert.deepEqual(state, initial());
});

test("replaying a completed review cannot add duplicate shared or legacy notifications", async () => {
  const state = initial();
  const client = makeClient(state);
  const decision = { action: "REJECT", documentId: "doc-1", rejectionReason: "Invalid document" };
  await persistCookFssaiTransition(client, { ...state.cook }, decision);
  await assert.rejects(persistCookFssaiTransition(client, { ...state.cook }, decision), { statusCode: 409 });
  assert.equal(state.sharedNotifications.length, 1);
  assert.equal(state.notifications.length, 1);
});

test("shared FSSAI producer uses a deterministic Cook-scoped idempotency key", async () => {
  const records = new Map();
  const transaction = { userNotification: { async upsert({ where, create }) {
    const key = `${where.userId_portal_eventKey.userId}:${where.userId_portal_eventKey.portal}:${where.userId_portal_eventKey.eventKey}`;
    if (!records.has(key)) records.set(key, create);
    return records.get(key);
  } } };
  const event = {
    cookUserId: "user-1", documentId: "doc-1", status: "APPROVED",
    title: "FSSAI verification approved", message: "Your FSSAI document has been approved.",
  };
  await notifyCookFssaiReview(transaction, event);
  await notifyCookFssaiReview(transaction, event);
  assert.equal(records.size, 1);
  assert.deepEqual([...records.values()].map(({ userId, portal, eventKey }) => [userId, portal, eventKey]), [
    ["user-1", "COOK", "fssai:doc-1:review:APPROVED:cook:user-1"],
  ]);
});

test("approval rejects a past expiry without changing document or profile", async () => {
  const state = initial();
  await assert.rejects(persistCookFssaiTransition(makeClient(state), { ...state.cook }, {
    action: "APPROVE", documentId: "doc-1", fssaiExpiryDate: "2020-01-01",
  }), /future date/);
  assert.deepEqual(state, initial());
});

test("approval rejects an expiry date that is today because the date must still be in the future", async () => {
  const state = initial();
  const today = new Date().toISOString().slice(0, 10);
  await assert.rejects(persistCookFssaiTransition(makeClient(state), { ...state.cook }, {
    action: "APPROVE", documentId: "doc-1", fssaiExpiryDate: today,
  }), /future date/);
  assert.deepEqual(state, initial());
});

test("approval rejects a missing uploaded document", async () => {
  const state = initial();
  state.document.cloudinaryPublicId = null;
  await assert.rejects(persistCookFssaiTransition(makeClient(state), { ...state.cook }, {
    action: "APPROVE", documentId: "doc-1", fssaiExpiryDate: "2027-03-04",
  }), /valid uploaded FSSAI document/);
  assert.equal(state.document.verificationStatus, "PENDING");
  assert.equal(state.cook.fssaiStatus, "SUBMITTED");
});

test("FSSAI review cannot proceed without an uploaded document or a required reason", async () => {
  const state = initial();
  await assert.rejects(persistCookFssaiTransition(makeClient(state), { ...state.cook }, {
    action: "REJECT", documentId: "doc-1", rejectionReason: "   ",
  }), /reason is required/);
  await assert.rejects(persistCookFssaiTransition(makeClient(state), { ...state.cook }, {
    action: "REJECT", rejectionReason: "Invalid certificate",
  }), /Select an uploaded FSSAI document/);
  assert.deepEqual(state, initial());
});
