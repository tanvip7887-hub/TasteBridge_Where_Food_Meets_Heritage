import assert from "node:assert/strict";
import test from "node:test";
import { persistFssaiDocumentSubmission } from "../modules/cook/cook.service.js";

const initial = () => ({
  existingDocuments: [{ id: "old", verificationStatus: "PENDING" }],
  newDocuments: [],
  cook: { fssaiStatus: "APPROVED", fssaiExpiryDate: new Date("2027-01-01"), isApprovedToSell: true, fssaiRejectionReason: null },
});

const client = (state, failCookWrite = false) => ({
  async $transaction(callback) {
    const working = structuredClone(state);
    const result = await callback({
      verificationDocument: {
        async updateMany({ data }) { Object.assign(working.existingDocuments[0], data); },
        async create({ data }) { const doc = { id: "new", ...data }; working.newDocuments.push(doc); return doc; },
      },
      cookProfile: { async update({ data }) { if (failCookWrite) throw new Error("cook update failure"); Object.assign(working.cook, data); } },
    });
    Object.assign(state, working);
    return result;
  },
});

test("replacement submission preserves old document history and requires new review", async () => {
  const state = initial();
  await persistFssaiDocumentSubmission(client(state), {
    userId: "user-1", cookProfileId: "cook-1",
    documentData: { documentType: "FSSAI_LICENSE", verificationStatus: "PENDING", documentUrl: "private://new" },
  });
  assert.equal(state.existingDocuments[0].verificationStatus, "NEEDS_REVISION");
  assert.equal(state.newDocuments[0].verificationStatus, "PENDING");
  assert.equal(state.cook.fssaiStatus, "SUBMITTED");
  assert.equal(state.cook.fssaiExpiryDate, null);
  assert.equal(state.cook.isApprovedToSell, false);
});

test("failed replacement database update leaves previous record and cook state untouched", async () => {
  const state = initial();
  await assert.rejects(persistFssaiDocumentSubmission(client(state, true), {
    userId: "user-1", cookProfileId: "cook-1", documentData: { verificationStatus: "PENDING" },
  }), /cook update failure/);
  assert.deepEqual(state, initial());
});
