import assert from "node:assert/strict";
import test from "node:test";
import { cookFssaiReviewSchema, updateVerificationStatusSchema } from "../modules/admin/admin.validation.js";

test("admin FSSAI approval requires a document and expiry date", () => {
  const result = cookFssaiReviewSchema.body.safeParse({ action: "APPROVE" });
  assert.equal(result.success, false);
  assert.ok(result.error.issues.some((issue) => issue.path.includes("documentId")));
  assert.ok(result.error.issues.some((issue) => issue.path.includes("fssaiExpiryDate")));
});

test("admin FSSAI rejection and request-new-document require a reason and document", () => {
  for (const action of ["REJECT", "REQUEST_NEW_DOCUMENT"]) {
    const result = cookFssaiReviewSchema.body.safeParse({ action, documentId: "doc-1", rejectionReason: "  " });
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.includes("rejectionReason")));
  }
});

test("general cook verification API cannot set FSSAI status", () => {
  const result = updateVerificationStatusSchema.body.safeParse({
    verificationStatus: "APPROVED",
    fssaiStatus: "APPROVED",
  });
  assert.equal(result.success, false);
});
