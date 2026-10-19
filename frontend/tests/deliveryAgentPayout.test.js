import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  getDeliveryAgentPayoutValidationError,
  normalizeDeliveryAgentPayoutDetails,
} from "../src/utils/deliveryAgentPayout.js";

test("delivery-agent payout details trim both required fields and accept a valid UPI destination", () => {
  const details = normalizeDeliveryAgentPayoutDetails({ upiId: " agent@bank ", accountHolderName: " Agent Name " });
  assert.deepEqual(details, { upiId: "agent@bank", accountHolderName: "Agent Name" });
  assert.equal(getDeliveryAgentPayoutValidationError(details), "");
});

test("delivery-agent payout form rejects malformed UPI IDs and missing or overlong names", () => {
  assert.match(getDeliveryAgentPayoutValidationError({ upiId: "bad-vpa", accountHolderName: "Agent Name" }), /valid UPI ID/i);
  assert.match(getDeliveryAgentPayoutValidationError({ upiId: "agent@bank", accountHolderName: "  " }), /account holder name/i);
  assert.match(getDeliveryAgentPayoutValidationError({ upiId: "agent@bank", accountHolderName: "A".repeat(101) }), /account holder name/i);
});

test("profile payout validation handles a missing database relation as null", () => {
  assert.deepEqual(normalizeDeliveryAgentPayoutDetails(null), { upiId: "", accountHolderName: "" });
  assert.match(getDeliveryAgentPayoutValidationError(null), /valid UPI ID/i);
});

test("delivery-agent profile and API submit the account holder name without payment credentials", async () => {
  const [profile, api] = await Promise.all([
    readFile(new URL("../src/pages/delivery/DeliveryAgentProfilePage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/api/deliveryAgentApi.js", import.meta.url), "utf8"),
  ]);
  assert.match(profile, /id="delivery-agent-account-holder-name"[\s\S]*required/);
  assert.match(profile, /name associated with the UPI account/i);
  assert.match(api, /submitPayoutDetails: \(\{ upiId, accountHolderName \}\) => api\.post\("\/delivery-agents\/payout-details", \{ upiId, accountHolderName \}\)/);
  assert.doesNotMatch(profile, /name="(?:cvv|otp|upiPin|cardNumber)"/i);
});

test("admin delivery-agent details dialog remains scrollable when its content exceeds the viewport", async () => {
  const adminPage = await readFile(new URL("../src/pages/admin/AdminDeliveryAgents.jsx", import.meta.url), "utf8");
  assert.match(adminPage, /className="fixed inset-0 z-50[^"]*overflow-y-auto/);
  assert.match(adminPage, /<div role="dialog" aria-modal="true" aria-labelledby="delivery-agent-detail-title" className="[^"]*max-h-\[calc\(100dvh-2rem\)\][^"]*overflow-y-auto/);
});
