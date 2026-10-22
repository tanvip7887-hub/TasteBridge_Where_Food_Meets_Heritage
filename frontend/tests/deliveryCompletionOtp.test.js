import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("delivery completion UI requests an email OTP and verifies only through the backend", async () => {
  const [page, api] = await Promise.all([
    read("../src/pages/delivery/DeliveryAgentSectionPage.jsx"),
    read("../src/api/deliveryAgentApi.js"),
  ]);
  assert.match(api, /requestDeliveryCompletionOtp:.*completion-otp/);
  assert.match(api, /getDeliveryCompletionOtpStatus:.*completion-otp/);
  assert.match(api, /markDeliveryCompleted: \(orderId, otp\).*\/complete`, \{ otp \}/);
  assert.match(page, /if \(action === "complete"\)[\s\S]*?await openCompletionOtp\(orderId\)/);
  assert.match(page, /deliveryAgentApi\.markDeliveryCompleted\(completionOtpOrderId, completionOtp\)/);
  assert.match(page, /aria-modal="true"/);
  assert.match(page, /Verify & Deliver/);
  assert.match(page, /Resend verification email/);
  assert.match(page, /emailStatus === "FAILED"/);
  assert.match(page, /role="alert"/);
  assert.match(page, /registered email/);
  assert.match(page, /retryAfterSeconds = \(error\)/);
  assert.match(page, /Please wait \$\{cooldown\} seconds before requesting another verification email\./);
  assert.match(page, /disabled=\{completionOtpRequestBusy \|\| completionOtpVerifyBusy \|\| completionOtpCooldown > 0\}/);
  assert.match(page, /getDeliveryCompletionOtpStatus\(completionOtpOrderId\)/);
  assert.match(page, /existingStatus = unwrap\(await deliveryAgentApi\.getDeliveryCompletionOtpStatus\(orderId\)\)/);
  assert.match(page, /Code expires in \$\{formatCountdown\(completionOtpExpiresIn\)\}/);
  assert.match(page, /setCompletionOtpExpiresIn\(secondsUntil\(status\.expiresAt\)\)/);
  assert.match(page, /existingStatus && existingSeconds > 0 && existingStatus\.emailStatus !== "FAILED"/);
  assert.match(page, /applyCompletionOtpStatus\(existingStatus\)/);
  assert.match(page, /disabled=\{completionOtp.length !== 6 \|\| completionOtpVerifyBusy \|\| completionOtpRequestBusy \|\| completionOtpEmailStatus === "FAILED" \|\| completionOtpExpiresIn <= 0\}/);
  assert.match(page, /Email destination: <span className="font-semibold text-gray-800">\{completionOtpEmailHint\}<\/span>/);
});
