import assert from "node:assert/strict";
import test from "node:test";
import { sendSuccess } from "../utils/apiResponse.js";
import { updateDishSchema } from "../modules/cook/cook.validation.js";
import {
  currencyNumber,
  divideRoundHalfUp,
  normalizeCurrency,
  normalizeRate,
  rateNumber,
  rupeesFromPaise,
  sumPaise,
  toPaise,
} from "../utils/money.js";

test("money helpers round currency to paise half-up without floating point arithmetic", () => {
  assert.equal(normalizeCurrency("1.005"), "1.01");
  assert.equal(normalizeCurrency("12.344"), "12.34");
  assert.equal(toPaise("999999999999.99"), 99999999999999n);
  assert.equal(rupeesFromPaise(12345n), "123.45");
  assert.equal(sumPaise(["0.10", "0.20", "1.05"]), 135n);
  assert.equal(divideRoundHalfUp(5n, 2n), 3n);
  assert.equal(divideRoundHalfUp(-5n, 2n), -3n);
  assert.throws(() => normalizeCurrency("1e999999"), { name: "RangeError" });
});

test("rates use four decimal places and remain separate from currency amounts", () => {
  assert.equal(normalizeRate("10.12555"), "10.1256");
  assert.equal(rateNumber("10.1256"), 10.1256);
});

test("dish price validation normalizes to paise precision and rejects zero after rounding", () => {
  const normalized = updateDishSchema.body.safeParse({ price: "1.005" });
  assert.equal(normalized.success, true);
  assert.equal(normalized.data.price, "1.01");
  assert.equal(updateDishSchema.body.safeParse({ price: "0.004" }).success, false);
});

test("API response serialization keeps monetary fields as JSON numbers", () => {
  let body;
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(value) { body = value; return value; },
  };
  sendSuccess(response, 200, "Success", {
    checkout: { totalAmount: "108.95", paymentAttempt: { amount: "108.95" } },
    settings: { platformFeePercent: "10.1256", deliveryFeeBase: "30.00" },
  });

  assert.equal(body.data.checkout.totalAmount, 108.95);
  assert.equal(body.data.checkout.paymentAttempt.amount, 108.95);
  assert.equal(body.data.settings.platformFeePercent, 10.1256);
  assert.equal(body.data.settings.deliveryFeeBase, 30);
  assert.equal(typeof body.data.checkout.totalAmount, "number");
});

test("maximum NUMERIC(14,2) currency values remain serializable as JSON numbers", () => {
  assert.equal(currencyNumber("999999999999.99"), 999999999999.99);
});
