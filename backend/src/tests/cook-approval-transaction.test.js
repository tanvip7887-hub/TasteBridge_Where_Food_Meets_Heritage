import assert from "node:assert/strict";
import test from "node:test";
import { persistCookVerificationTransition } from "../modules/admin/admin.service.js";

const initialState = () => ({
  user: { id: "user-1", role: "CUSTOMER" },
  cook: { id: "cook-1", verificationStatus: "PENDING", fssaiStatus: "SUBMITTED", isApprovedToSell: false },
  document: { documentType: "IDENTITY_PROOF", verificationStatus: "PENDING" },
  fssaiDocument: { documentType: "FSSAI_LICENSE", verificationStatus: "PENDING" },
});

const transactionalClient = (state, { failProfileUpdate = false } = {}) => ({
  async $transaction(callback) {
    const working = structuredClone(state);
    const tx = {
      user: {
        async update({ data }) {
          Object.assign(working.user, data);
        },
      },
      cookProfile: {
        async update({ data }) {
          if (failProfileUpdate) throw new Error("simulated profile write failure");
          Object.assign(working.cook, data);
          return { ...working.cook, user: { ...working.user } };
        },
      },
      verificationDocument: {
        async updateMany({ where, data }) {
          const selected = where.documentType?.not === "FSSAI_LICENSE" ? working.document : working.fssaiDocument;
          Object.assign(selected, data);
        },
      },
    };

    const result = await callback(tx);
    Object.assign(state.user, working.user);
    Object.assign(state.cook, working.cook);
    Object.assign(state.document, working.document);
    Object.assign(state.fssaiDocument, working.fssaiDocument);
    return result;
  },
});

test("cook approval commits the role and profile status together", async () => {
  const state = initialState();
  const result = await persistCookVerificationTransition(
    transactionalClient(state),
    { id: "cook-1", userId: "user-1" },
    "APPROVED",
    { verificationStatus: "APPROVED", isApprovedToSell: false }
  );

  assert.equal(state.user.role, "COOK");
  assert.equal(state.cook.verificationStatus, "APPROVED");
  assert.equal(state.document.verificationStatus, "APPROVED");
  assert.equal(state.fssaiDocument.verificationStatus, "PENDING");
  assert.equal(state.cook.fssaiStatus, "SUBMITTED");
  assert.equal(state.cook.isApprovedToSell, false);
  assert.equal(result.user.role, "COOK");
});

test("rejection revokes the cook role and disables selling in the same transition", async () => {
  const state = initialState();
  state.user.role = "COOK";
  state.cook.verificationStatus = "APPROVED";
  state.cook.isApprovedToSell = true;

  await persistCookVerificationTransition(
    transactionalClient(state),
    { id: "cook-1", userId: "user-1" },
    "REJECTED",
    { verificationStatus: "REJECTED", isApprovedToSell: false }
  );

  assert.equal(state.user.role, "CUSTOMER");
  assert.equal(state.cook.verificationStatus, "REJECTED");
  assert.equal(state.cook.isApprovedToSell, false);
  assert.equal(state.document.verificationStatus, "PENDING");
  assert.equal(state.fssaiDocument.verificationStatus, "PENDING");
});

test("failed profile write does not leave a partially promoted cook role", async () => {
  const state = initialState();

  await assert.rejects(
    persistCookVerificationTransition(
      transactionalClient(state, { failProfileUpdate: true }),
      { id: "cook-1", userId: "user-1" },
      "APPROVED",
      { verificationStatus: "APPROVED", isApprovedToSell: false }
    ),
    /simulated profile write failure/
  );

  assert.deepEqual(state, initialState());
});
