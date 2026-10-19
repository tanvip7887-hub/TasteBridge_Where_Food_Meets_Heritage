import assert from "node:assert/strict";
import test from "node:test";
import { deliveryAgentPayoutDetailsSchema } from "../modules/delivery-agent/delivery-agent.validation.js";
import { submitDeliveryAgentPayoutDetails } from "../modules/delivery-agent/delivery-agent.service.js";
import { persistDeliveryAgentPayoutReview } from "../modules/admin/admin.service.js";
import { reviewDeliveryAgentPayoutDetailsSchema } from "../modules/admin/admin.validation.js";
import { readFile } from "node:fs/promises";

const now = new Date("2026-10-17T12:00:00.000Z");
const makeSubmissionDb = ({ role = "DELIVERY_AGENT", accountStatus = "ACTIVE", profileStatus = "APPROVED", payoutStatus = null, payoutUpiId = "agent@bank", payoutAccountHolderName = "Agent Name" } = {}) => {
  const calls = [];
  const details = {
    id: "payout-1", deliveryAgentId: "agent-1", upiId: "agent@bank", accountHolderName: "Agent Name", verificationStatus: "PENDING",
    rejectionReason: null, submittedAt: now, reviewedAt: null,
  };
  const tx = {
    user: { findUnique: async () => ({ id: "user-1", role, status: accountStatus }) },
    deliveryAgent: {
      findUnique: async () => ({ id: "agent-1", verificationStatus: profileStatus, payoutDetails: payoutStatus ? {
        upiId: payoutUpiId, accountHolderName: payoutAccountHolderName, verificationStatus: payoutStatus,
      } : null }),
      updateMany: async (query) => { calls.push(query); return { count: 1 }; },
    },
    deliveryAgentPayoutDetails: {
      upsert: async (query) => { calls.push(query); return { ...details, upiId: query.create.upiId, accountHolderName: query.create.accountHolderName }; },
    },
  };
  return { calls, database: { $transaction: async (callback, options) => { calls.push(options); return callback(tx); } } };
};

test("payout submission validates UPI ID and account holder name, rejecting credentials or extra bank fields", () => {
  assert.deepEqual(deliveryAgentPayoutDetailsSchema.body.parse({ upiId: " agent.name+tag@bank ", accountHolderName: "  Agent Name  " }), {
    upiId: "agent.name+tag@bank", accountHolderName: "Agent Name",
  });
  assert.equal(deliveryAgentPayoutDetailsSchema.body.safeParse({ upiId: "not-a-vpa", accountHolderName: "Agent Name" }).success, false);
  assert.equal(deliveryAgentPayoutDetailsSchema.body.safeParse({ upiId: "agent@bank", accountHolderName: "  " }).success, false);
  assert.equal(deliveryAgentPayoutDetailsSchema.body.safeParse({ upiId: "agent@bank" }).success, false);
  assert.equal(deliveryAgentPayoutDetailsSchema.body.safeParse({ upiId: "agent@bank", accountHolderName: "Agent Name", accountNumber: "123" }).success, false);
  assert.equal(reviewDeliveryAgentPayoutDetailsSchema.body.safeParse({ action: "REJECT" }).success, false);
  assert.equal(reviewDeliveryAgentPayoutDetailsSchema.body.safeParse({ action: "APPROVE", rejectionReason: "anything" }).success, true);
});

test("approved active delivery agent submits pending payout details and is taken offline atomically", async () => {
  const { database, calls } = makeSubmissionDb();
  const result = await submitDeliveryAgentPayoutDetails(database, "user-1", " agent@bank ", " Agent Name ", now);
  assert.equal(result.verificationStatus, "PENDING");
  assert.equal(result.upiId, "agent@bank");
  assert.equal(result.accountHolderName, "Agent Name");
  assert.equal(calls[0].isolationLevel, "Serializable");
  assert.deepEqual(calls[1].data, { isAvailable: false });
  assert.equal(calls[2].create.verificationStatus, "PENDING");
  assert.equal(calls[2].create.accountHolderName, "Agent Name");
});

test("rejected or approved details can be corrected and resubmitted as pending", async () => {
  const { database, calls } = makeSubmissionDb({ payoutStatus: "REJECTED" });
  const result = await submitDeliveryAgentPayoutDetails(database, "user-1", "new.agent@bank", "New Agent", now);
  const upsert = calls.find((call) => call.update);
  assert.equal(result.verificationStatus, "PENDING");
  assert.equal(upsert.update.verificationStatus, "PENDING");
  assert.equal(upsert.update.rejectionReason, null);
  assert.equal(upsert.update.reviewedAt, null);
  assert.equal(upsert.update.accountHolderName, "New Agent");
});

test("a legacy pending record with missing holder name can be completed", async () => {
  const { database, calls } = makeSubmissionDb({ payoutStatus: "PENDING", payoutAccountHolderName: " " });
  const result = await submitDeliveryAgentPayoutDetails(database, "user-1", "agent@bank", "Agent Name", now);
  assert.equal(result.accountHolderName, "Agent Name");
  assert.equal(calls.find((call) => call.update)?.update.accountHolderName, "Agent Name");
});

test("payout submission is blocked for inactive, unapproved, or already-pending accounts", async () => {
  for (const options of [
    { accountStatus: "SUSPENDED" },
    { profileStatus: "PENDING" },
    { payoutStatus: "PENDING" },
  ]) {
    const { database } = makeSubmissionDb(options);
    await assert.rejects(submitDeliveryAgentPayoutDetails(database, "user-1", "agent@bank", "Agent Name", now), (error) => [403, 409].includes(error.statusCode));
  }
});

test("payout submission rejects missing holder names before opening a transaction", async () => {
  let transactionCalls = 0;
  const database = { $transaction: async () => { transactionCalls += 1; } };
  await assert.rejects(submitDeliveryAgentPayoutDetails(database, "user-1", "agent@bank", " "), { statusCode: 400 });
  assert.equal(transactionCalls, 0);
});

const makeReviewDb = ({ adminRole = "ADMIN", ownerId = "agent-user", initialStatus = "PENDING", updateCount = 1, accountHolderName = "Agent Name", upiId = "agent@bank" } = {}) => {
  const calls = [];
  const reviewed = { id: "payout-1", verificationStatus: "APPROVED", upiId, accountHolderName, rejectionReason: null, reviewedBy: "admin-1" };
  const tx = {
    user: { findUnique: async () => ({ id: "admin-1", role: adminRole, status: "ACTIVE" }) },
    deliveryAgentPayoutDetails: {
      findUnique: async (query) => query.where.deliveryAgentId
        ? { id: "payout-1", deliveryAgentId: "agent-1", upiId, accountHolderName, verificationStatus: initialStatus, deliveryAgent: {
          userId: ownerId,
          verificationStatus: "APPROVED",
          user: { role: "DELIVERY_AGENT", status: "ACTIVE" },
        } }
        : reviewed,
      updateMany: async (query) => { calls.push(query); return { count: updateCount }; },
    },
  };
  return { calls, database: { $transaction: async (callback, options) => { calls.push(options); return callback(tx); } } };
};

test("admin review approves pending payout details with an audit reviewer and timestamp", async () => {
  const { database, calls } = makeReviewDb();
  const result = await persistDeliveryAgentPayoutReview(database, "agent-1", "admin-1", { action: "APPROVE" }, now);
  assert.equal(result.verificationStatus, "APPROVED");
  assert.equal(calls[0].isolationLevel, "Serializable");
  assert.equal(calls[1].where.verificationStatus, "PENDING");
  assert.equal(calls[1].data.reviewedBy, "admin-1");
  assert.equal(calls[1].data.reviewedAt, now);
});

test("admin rejection preserves the reason and agent or repeated reviews cannot approve", async () => {
  const { database, calls } = makeReviewDb();
  await persistDeliveryAgentPayoutReview(database, "agent-1", "admin-1", { action: "REJECT", rejectionReason: "Please correct the UPI ID." }, now);
  assert.equal(calls[1].data.verificationStatus, "REJECTED");
  assert.equal(calls[1].data.rejectionReason, "Please correct the UPI ID.");

  const selfReview = makeReviewDb({ ownerId: "admin-1" });
  await assert.rejects(persistDeliveryAgentPayoutReview(selfReview.database, "agent-1", "admin-1", { action: "APPROVE" }, now), { statusCode: 403 });
  const repeated = makeReviewDb({ updateCount: 0 });
  await assert.rejects(persistDeliveryAgentPayoutReview(repeated.database, "agent-1", "admin-1", { action: "APPROVE" }, now), { statusCode: 409 });
});

test("admin payout review rejects non-admin actors and requires a rejection reason", async () => {
  const notAdmin = makeReviewDb({ adminRole: "DELIVERY_AGENT" });
  await assert.rejects(persistDeliveryAgentPayoutReview(notAdmin.database, "agent-1", "admin-1", { action: "APPROVE" }, now), { statusCode: 403 });
  const admin = makeReviewDb();
  await assert.rejects(persistDeliveryAgentPayoutReview(admin.database, "agent-1", "admin-1", { action: "REJECT", rejectionReason: " " }, now), { statusCode: 400 });
});

test("admin cannot approve a legacy payout without a valid UPI ID and account holder name", async () => {
  for (const incomplete of [{ accountHolderName: " " }, { upiId: "invalid-vpa" }]) {
    const { database, calls } = makeReviewDb(incomplete);
    await assert.rejects(
      persistDeliveryAgentPayoutReview(database, "agent-1", "admin-1", { action: "APPROVE" }, now),
      { statusCode: 409 },
    );
    assert.equal(calls.some((call) => call.data?.verificationStatus === "APPROVED"), false);
  }
});

test("payout APIs use authenticated agent access and the global admin role guard", async () => {
  const deliveryRoutes = await readFile(new URL("../modules/delivery-agent/delivery-agent.routes.js", import.meta.url), "utf8");
  const adminRoutes = await readFile(new URL("../modules/admin/admin.routes.js", import.meta.url), "utf8");
  const deliveryController = await readFile(new URL("../modules/delivery-agent/delivery-agent.controller.js", import.meta.url), "utf8");
  assert.match(deliveryRoutes, /router\.use\(authenticate\)/);
  assert.match(deliveryRoutes, /"\/payout-details",\s*requireApprovedDeliveryAgent,\s*validate\(deliveryAgentPayoutDetailsSchema\)/);
  assert.match(deliveryController, /req\.body\.accountHolderName/);
  assert.match(adminRoutes, /router\.use\(authenticate,\s*requireRole\("ADMIN"\)\)/);
  assert.match(adminRoutes, /"\/delivery-agents\/:id\/payout-details",\s*validate\(reviewDeliveryAgentPayoutDetailsSchema\),\s*reviewDeliveryAgentPayoutDetails/);
});
