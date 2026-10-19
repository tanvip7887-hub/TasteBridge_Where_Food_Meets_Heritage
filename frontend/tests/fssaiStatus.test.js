import assert from "node:assert/strict";
import test from "node:test";
import { getCookFssaiStatusMessage } from "../src/utils/fssaiStatus.js";

test("cook FSSAI statuses have plain-language next actions", () => {
  const cases = [
    ["NOT_SUBMITTED", "Not submitted", /Submit your FSSAI details/],
    ["IN_PROCESS", "In process", /Upload your certificate/],
    ["SUBMITTED", "Submitted", /Waiting for admin review/],
    ["APPROVED", "Approved", /Certificate expires/],
    ["REJECTED", "Rejected", /corrected certificate/],
  ];
  for (const [status, label, nextAction] of cases) {
    const result = getCookFssaiStatusMessage(status, "2027-06-10T23:59:59.999Z", "Please correct the scan", new Date("2026-01-01"));
    assert.equal(result.label, label);
    assert.match(result.nextAction, nextAction);
  }
});

test("approved certificate is presented as expired after expiry", () => {
  const result = getCookFssaiStatusMessage("APPROVED", "2025-06-10T23:59:59.999Z", null, new Date("2026-01-01"));
  assert.equal(result.status, "EXPIRED");
  assert.equal(result.label, "Expired");
  assert.match(result.nextAction, /renewed certificate/);
});
