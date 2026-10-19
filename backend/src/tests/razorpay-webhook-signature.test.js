import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  createRazorpayWebhookVerifier,
  verifyRazorpayWebhookSignature,
} from "../modules/payments/razorpayWebhookSignature.js";

const secret = "test-webhook-secret-only";
const rawBody = Buffer.from('{"event":"payment.captured","payload":{"id":"pay_test_123"}}');
const signatureFor = (body = rawBody) => createHmac("sha256", secret).update(body).digest("hex");

test("Razorpay webhook verifier accepts a valid signature over the exact raw body", () => {
  assert.equal(verifyRazorpayWebhookSignature({ rawBody, signature: signatureFor(), secret }), true);
  assert.equal(createRazorpayWebhookVerifier(secret).verify({ rawBody, signature: signatureFor() }), true);
});

test("Razorpay webhook verifier rejects a modified body or signature", () => {
  const signature = signatureFor();
  assert.equal(verifyRazorpayWebhookSignature({
    rawBody: Buffer.from(`${rawBody.toString()} `), signature, secret,
  }), false);
  assert.equal(verifyRazorpayWebhookSignature({
    rawBody, signature: `${signature.slice(0, -1)}0`, secret,
  }), false);
});

test("Razorpay webhook verifier fails closed for missing secret, non-Buffer body, and malformed signatures", () => {
  const signature = signatureFor();
  assert.equal(verifyRazorpayWebhookSignature({ rawBody, signature, secret: "" }), false);
  assert.equal(verifyRazorpayWebhookSignature({ rawBody: rawBody.toString(), signature, secret }), false);
  assert.equal(verifyRazorpayWebhookSignature({ rawBody, signature: "not-a-signature", secret }), false);
  assert.equal(verifyRazorpayWebhookSignature({ rawBody: Buffer.alloc(0), signature, secret }), false);
});

test("Razorpay webhook verifier accepts uppercase hexadecimal signature encoding", () => {
  assert.equal(verifyRazorpayWebhookSignature({ rawBody, signature: signatureFor().toUpperCase(), secret }), true);
});
