import assert from "node:assert/strict";
import test from "node:test";
import { getLatestFssaiDocument, getOtherVerificationDocuments } from "../src/utils/adminCookDocuments.js";

test("admin cook details select the latest FSSAI upload and omit its history from the general list", () => {
  const documents = [
    { id: "old-fssai", documentType: "FSSAI_LICENSE", createdAt: "2026-10-10T10:00:00Z", verificationStatus: "APPROVED" },
    { id: "identity", documentType: "IDENTITY_PROOF", createdAt: "2026-10-11T10:00:00Z" },
    { id: "current-fssai", documentType: "FSSAI_LICENSE", createdAt: "2026-10-12T10:00:00Z", verificationStatus: "PENDING" },
  ];

  assert.equal(getLatestFssaiDocument(documents).id, "current-fssai");
  assert.deepEqual(getOtherVerificationDocuments(documents).map(({ id }) => id), ["identity"]);
});

test("tied FSSAI upload timestamps use a stable ID tie-breaker", () => {
  const documents = [
    { id: "doc-a", documentType: "FSSAI_LICENSE", createdAt: "2026-10-12T10:00:00Z" },
    { id: "doc-z", documentType: "FSSAI_LICENSE", createdAt: "2026-10-12T10:00:00Z" },
  ];
  assert.equal(getLatestFssaiDocument(documents).id, "doc-z");
  assert.equal(getLatestFssaiDocument([]), null);
});
