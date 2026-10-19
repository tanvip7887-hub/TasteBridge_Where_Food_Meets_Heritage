import assert from "node:assert/strict";
import test from "node:test";
import { getCookStatus, isApprovedCook } from "../src/utils/cookAuth.js";

test("approved cook access is available across accounts and portals only when the profile is approved", () => {
  assert.equal(
    isApprovedCook({ role: "COOK", cookProfile: { verificationStatus: "APPROVED" } }),
    true
  );
  assert.equal(
    isApprovedCook({ role: "COOK", cookProfile: { verificationStatus: "PENDING" } }),
    false
  );
  assert.equal(
    isApprovedCook({ role: "COOK", cookProfile: { verificationStatus: "REJECTED" } }),
    false
  );
  assert.equal(
    isApprovedCook({ role: "CUSTOMER", activePortal: "CUSTOMER", availablePortals: ["CUSTOMER", "COOK"], cookProfile: { verificationStatus: "APPROVED" } }),
    true
  );
  assert.equal(isApprovedCook({ role: "CUSTOMER", availablePortals: ["CUSTOMER"], cookProfile: { verificationStatus: "APPROVED" } }), false);
  assert.equal(isApprovedCook({ role: "COOK", cookProfile: null }), false);
  assert.equal(isApprovedCook(null), false);
});

test("cook status reports the application status unless the user is approved", () => {
  assert.equal(getCookStatus({ role: "COOK", cookProfile: { verificationStatus: "PENDING" } }), "PENDING");
  assert.equal(getCookStatus({ role: "COOK", cookProfile: { verificationStatus: "REJECTED" } }), "REJECTED");
  assert.equal(getCookStatus({ role: "COOK", cookProfile: { verificationStatus: "APPROVED" } }), "APPROVED");
  assert.equal(getCookStatus(null), null);
});
