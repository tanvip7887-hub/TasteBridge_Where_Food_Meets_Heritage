import { createHmac, timingSafeEqual } from "node:crypto";

const SHA256_HEX = /^[a-f0-9]{64}$/i;

/**
 * Verify Razorpay's X-Razorpay-Signature for a webhook request.
 *
 * `rawBody` must be the exact Buffer received over HTTP. Re-serializing parsed
 * JSON can change bytes and must not be used for signature verification.
 * This verifies authenticity only; callers must still validate and process
 * the event idempotently before changing payment or order state.
 */
export const verifyRazorpayWebhookSignature = ({ rawBody, signature, secret }) => {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return false;
  if (typeof secret !== "string" || secret.length === 0) return false;
  if (typeof signature !== "string" || !SHA256_HEX.test(signature)) return false;

  const provided = Buffer.from(signature, "hex");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected);
};

/** Provider-bound verifier keeps the webhook secret at the server boundary. */
export const createRazorpayWebhookVerifier = (webhookSecret) => Object.freeze({
  verify: ({ rawBody, signature }) => verifyRazorpayWebhookSignature({
    rawBody,
    signature,
    secret: webhookSecret,
  }),
});
