import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { errorHandler } from "../middlewares/errorHandler.js";
import { sendDeliveryCompletionOtpEmail } from "../services/email.service.js";
import { AppError } from "../utils/AppError.js";

const invokeHandler = (error) => {
  let statusCode;
  let body;
  const headers = {};
  errorHandler(error, {
    id: "request-123",
    method: "POST",
    path: "/api/v1/delivery-agents/deliveries/order-123/complete",
    baseUrl: "/api/v1/delivery-agents",
    route: { path: "/deliveries/:orderId/complete" },
  }, {
    setHeader(name, value) { headers[name] = value; return this; },
    status(value) { statusCode = value; return this; },
    json(value) { body = value; return this; },
  }, () => {});
  return { statusCode, body, headers };
};

test("expected delivery OTP 400 and 429 errors log safe metadata without stack traces or personal data", () => {
  const entries = [];
  const originalWarn = console.warn;
  console.warn = (message) => entries.push(String(message));
  try {
    const invalid = invokeHandler(new AppError("That code is incorrect for customer@example.test: 123456", 400));
    const cooldownError = new AppError("Please wait before requesting another verification email for customer@example.test.", 429, null, 37);
    cooldownError.errorCode = "DELIVERY_OTP_RESEND_COOLDOWN";
    const cooldown = invokeHandler(cooldownError);

    assert.equal(invalid.statusCode, 400);
    assert.equal(cooldown.statusCode, 429);
    assert.equal(cooldown.headers["Retry-After"], "37");
    assert.match(entries[0], /requestId.*request-123/);
    assert.match(entries[1], /DELIVERY_OTP_RESEND_COOLDOWN/);
    assert.ok(entries.every((entry) => !entry.includes("customer@example.test")));
    assert.ok(entries.every((entry) => !entry.includes("123456")));
    assert.ok(entries.every((entry) => !entry.includes("stack")));
  } finally {
    console.warn = originalWarn;
  }
});

test("unexpected error logs retain a safe stack trace while redacting PII and secret data", () => {
  const entries = [];
  const originalError = console.error;
  console.error = (message) => entries.push(String(message));
  try {
    const error = new Error("SMTP payload to customer@example.test contains code 654321 and private email body");
    error.stack = `${error.stack}\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at send (token=abcdefghijklmnopqrstuvwxyz0123456789, phone=+919876543210)`;
    invokeHandler(error);
  } finally {
    console.error = originalError;
  }
  assert.equal(entries.length, 1);
  assert.match(entries[0], /Unexpected server error/);
  assert.match(entries[0], /errorType.*Error/);
  assert.match(entries[0], /at send/);
  assert.match(entries[0], /processTicksAndRejections/);
  assert.ok(!entries[0].includes("customer@example.test"));
  assert.ok(!entries[0].includes("654321"));
  assert.ok(!entries[0].includes("9876543210"));
  assert.ok(!entries[0].includes("private email body"));
  assert.ok(!entries[0].includes("abcdefghijklmnopqrstuvwxyz0123456789"));
});

test("delivery OTP SMTP acceptance log template excludes recipient and code data", async () => {
  const emailService = await readFile(new URL("../services/email.service.js", import.meta.url), "utf8");
  const otpEmailFunction = emailService.slice(
    emailService.indexOf("export const sendDeliveryCompletionOtpEmail"),
    emailService.indexOf("// Modular email dispatcher"),
  );
  const acceptanceLog = otpEmailFunction.match(/logger\.info\(([^;]+)\);/)?.[1] || "";
  assert.match(acceptanceLog, /Delivery verification email accepted by SMTP/);
  assert.doesNotMatch(acceptanceLog, /\$\{(?:to|otp|info\.messageId)\}/);

  const logs = [];
  const originalLog = console.log;
  let sentMessage;
  console.log = (message) => logs.push(String(message));
  try {
    const result = await sendDeliveryCompletionOtpEmail({
      to: "private.customer@example.test",
      name: "Customer",
      orderNumber: "TB-PRIVATE-ORDER",
      otp: "485219",
    }, {
      smtpConfigured: () => true,
      transporter: { sendMail: async (message) => { sentMessage = message; return { messageId: "private-message-id" }; } },
    });
    assert.deepEqual(result, { success: true, messageId: "private-message-id" });
    assert.equal(sentMessage.to, "private.customer@example.test");
    assert.ok(sentMessage.text.includes("485219"));
  } finally {
    console.log = originalLog;
  }
  assert.equal(logs.length, 1);
  assert.ok(logs[0].includes("accepted by SMTP"));
  assert.ok(!logs[0].includes("private.customer@example.test"));
  assert.ok(!logs[0].includes("485219"));
  assert.ok(!logs[0].includes("private-message-id"));
});
