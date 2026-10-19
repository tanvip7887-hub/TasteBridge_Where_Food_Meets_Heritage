import assert from "node:assert/strict";
import test from "node:test";
import { effectiveFssaiStatus, fssaiExpiryDateIsFuture, statusForFssaiDetails } from "../utils/fssai.js";

test("approved FSSAI status is evaluated as expired when its certificate date has passed", () => {
  assert.equal(effectiveFssaiStatus("APPROVED", new Date("2026-01-01"), new Date("2026-02-01")), "EXPIRED");
  assert.equal(effectiveFssaiStatus("APPROVED", new Date("2026-03-01"), new Date("2026-02-01")), "APPROVED");
  assert.equal(effectiveFssaiStatus("SUBMITTED", null, new Date("2026-02-01")), "SUBMITTED");
});

test("cook FSSAI details map to the intended submission states", () => {
  assert.equal(statusForFssaiDetails("NOT_YET_REGISTERED"), "NOT_SUBMITTED");
  assert.equal(statusForFssaiDetails("APPLIED_ON_FOSCOS"), "IN_PROCESS");
  assert.equal(statusForFssaiDetails("HAVE_REGISTRATION"), "NOT_SUBMITTED");
});

test("expiry date validation rejects today, past, and invalid calendar dates", () => {
  const now = new Date("2026-10-14T12:00:00.000Z");
  assert.equal(fssaiExpiryDateIsFuture("2026-10-14", now), false);
  assert.equal(fssaiExpiryDateIsFuture("2026-10-13", now), false);
  assert.equal(fssaiExpiryDateIsFuture("2026-02-30", now), false);
  assert.equal(fssaiExpiryDateIsFuture("2026-10-15", now), true);
});
