import assert from "node:assert/strict";
import test from "node:test";
import { HTTP_STATUS } from "../constants/index.js";
import { createSimulatedPaymentProvider } from "../modules/payments/simulatedPayment.provider.js";

const now = new Date("2026-10-15T12:00:00.000Z");

test("simulated provider creates a pending intent with server-owned safe metadata", async () => {
  const provider = createSimulatedPaymentProvider({ now: () => now });
  const attempt = await provider.createPayment({ amount: 125.5, expiresAt: new Date("2026-10-15T12:15:00.000Z") });

  assert.match(attempt.reference, /^TB-SIM-[A-F0-9]{32}$/);
  assert.equal(attempt.amount, "125.50");
  assert.equal(attempt.currency, "INR");
  assert.equal(attempt.method, "SIMULATED");
  assert.equal(attempt.methodLabel, "TasteBridge simulated payment");
  assert.equal(attempt.status, "PENDING");
  assert.equal(attempt.expiresAt.toISOString(), "2026-10-15T12:15:00.000Z");
  assert.equal("cardNumber" in attempt, false);
  assert.equal("cvv" in attempt, false);
});

test("simulated provider normalizes its amount to currency precision", async () => {
  const provider = createSimulatedPaymentProvider({ now: () => now });
  const attempt = await provider.createPayment({ amount: "1.005", expiresAt: new Date("2026-10-15T12:15:00.000Z") });
  assert.equal(attempt.amount, "1.01");
});

test("simulated provider rejects invalid server amounts and expired intents", async () => {
  const provider = createSimulatedPaymentProvider({ now: () => now });
  await assert.rejects(
    provider.createPayment({ amount: 0, expiresAt: new Date("2026-10-15T12:15:00.000Z") }),
    (error) => error.statusCode === HTTP_STATUS.BAD_REQUEST,
  );
  await assert.rejects(
    provider.createPayment({ amount: 10, expiresAt: new Date("2026-10-15T11:59:00.000Z") }),
    (error) => error.statusCode === HTTP_STATUS.BAD_REQUEST,
  );
});

test("simulated provider requires an explicit mock choice and refund remains unavailable", async () => {
  const provider = createSimulatedPaymentProvider({ now: () => now });
  const reference = "TB-SIM-0123456789ABCDEF0123456789ABCDEF";
  await assert.rejects(provider.confirmPayment({ reference, status: "FAILED", success: false }), (error) => error.statusCode === HTTP_STATUS.BAD_REQUEST);
  const confirmation = await provider.confirmPayment({ reference, mockOutcome: "SUCCESS" });
  assert.deepEqual(confirmation, { reference, status: "SUCCEEDED" });
  const declining = await provider.confirmPayment({ reference, mockOutcome: "FAILURE" });
  assert.equal(declining.status, "FAILED");
  await assert.rejects(
    provider.confirmPayment({ reference: "TB-SIM-0123456789ABCDEF0123456789ABCDEF", mockOutcome: "SUCCEEDED" }),
    (error) => error.statusCode === HTTP_STATUS.BAD_REQUEST,
  );
  await assert.rejects(provider.refundPayment({ status: "REFUNDED" }), (error) => {
    assert.equal(error.statusCode, HTTP_STATUS.SERVICE_UNAVAILABLE);
    assert.match(error.message, /not enabled/);
    return true;
  });
});
