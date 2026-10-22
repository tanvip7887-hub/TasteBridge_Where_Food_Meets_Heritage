import assert from "node:assert/strict";
import test from "node:test";
import { createDeliveryWorkService } from "../modules/delivery-agent/delivery-agent.service.js";

const approvedDocuments = [{ id: "identity", documentType: "IDENTITY_PROOF", verificationStatus: "APPROVED", createdAt: new Date("2026-01-01") }];
const agent = { id: "agent-1", userId: "user-1", verificationStatus: "APPROVED", isAvailable: true, deliveryType: "BICYCLE", vehicleType: "Bicycle", payoutDetails: { verificationStatus: "APPROVED", upiId: "agent@bank", accountHolderName: "Agent Name" }, user: { status: "ACTIVE", role: "DELIVERY_AGENT", verificationDocuments: approvedDocuments } };

const acceptedEmail = () => ({ success: true, messageId: "mock-message-id" });
const fixture = ({ emailSender = async () => acceptedEmail(), start = new Date("2026-10-22T10:00:00Z") } = {}) => {
  let clock = new Date(start);
  const state = {
    order: {
      id: "order-1", orderNumber: "TB-OTP-1", customerId: "customer-1", cookId: "cook-1", deliveryAgentId: "agent-1",
      status: "OUT_FOR_DELIVERY", paymentStatus: "PENDING", totalAmount: "141.00", deliveryFee: "30.00", deliveryEarning: "30.00",
      cookName: "Kitchen", customer: { name: "Registered Customer", email: "registered@example.test" }, checkout: { paymentMethod: "COD" },
      address: null, items: [], createdAt: new Date(start), updatedAt: new Date(start),
    },
    otp: null,
    history: [],
    notifications: [],
  };
  let transactionTail = Promise.resolve();
  const matches = (record, where = {}) => Object.entries(where).every(([key, expected]) => {
    if (key === "expiresAt" && expected?.gt) return record.expiresAt > expected.gt;
    if (key === "attempts" && expected?.lt !== undefined) return record.attempts < expected.lt;
    return record[key] === expected;
  });
  const buildClient = (working) => ({
    deliveryAgent: { findUnique: async ({ where }) => where.userId === "user-1" ? structuredClone(agent) : null },
    address: { findFirst: async () => ({ landmark: JSON.stringify({ deliveryType: "BICYCLE" }) }) },
    order: {
      findFirst: async ({ where } = {}) => matches(working.order, where) ? structuredClone(working.order) : null,
      updateMany: async ({ where, data }) => {
        if (!matches(working.order, where)) return { count: 0 };
        Object.assign(working.order, data);
        return { count: 1 };
      },
    },
    deliveryCompletionOtp: {
      findUnique: async ({ where }) => where.orderId === working.order.id && working.otp ? structuredClone(working.otp) : null,
      upsert: async ({ create, update }) => {
        working.otp = { id: "otp-record-1", ...structuredClone(working.otp ? update : create) };
        return structuredClone(working.otp);
      },
      updateMany: async ({ where, data }) => {
        if (!working.otp || !matches(working.otp, where)) return { count: 0 };
        Object.assign(working.otp, data);
        return { count: 1 };
      },
    },
    orderStatusHistory: { create: async ({ data }) => { working.history.push(structuredClone(data)); return data; } },
    userNotification: { upsert: async ({ where, create }) => {
      const key = where?.userId_portal_eventKey?.eventKey || create.eventKey;
      let item = working.notifications.find((notification) => notification.eventKey === key);
      if (!item) { item = structuredClone(create); working.notifications.push(item); }
      return item;
    } },
    cookProfile: { findUnique: async () => null },
    $queryRaw: async () => [{ available: true }],
  });
  const db = {
    deliveryAgent: { findUnique: async ({ where }) => where.userId === "user-1" ? structuredClone(agent) : null },
    address: { findFirst: async () => ({ landmark: JSON.stringify({ deliveryType: "BICYCLE" }) }) },
    order: { findFirst: async ({ where }) => matches(state.order, where) ? structuredClone(state.order) : null },
    deliveryCompletionOtp: {
      findUnique: async ({ where }) => where.orderId === state.order.id && state.otp ? structuredClone(state.otp) : null,
      updateMany: async ({ where, data }) => {
        if (!state.otp || !matches(state.otp, where)) return { count: 0 };
        Object.assign(state.otp, data);
        return { count: 1 };
      },
    },
    $transaction: async (callback) => {
      let release;
      const previous = transactionTail;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      const working = structuredClone(state);
      try {
        const result = await callback(buildClient(working));
        Object.assign(state, working);
        return result;
      } finally { release(); }
    },
  };
  return { state, work: createDeliveryWorkService(db, () => new Date(clock), emailSender), advance: (ms) => { clock = new Date(clock.getTime() + ms); } };
};

test("registered customer email is submitted through the existing email service and the API result never contains the code", async () => {
  let emailJob;
  const { work, state } = fixture({ emailSender: async (job) => { emailJob = job; return acceptedEmail(); } });
  const result = await work.requestCompletionOtp("user-1", "order-1");
  assert.equal(emailJob.to, "registered@example.test");
  assert.equal(emailJob.type, "DELIVERY_COMPLETION_OTP");
  assert.equal(emailJob.otp.length, 6);
  assert.equal(emailJob.expiresInMinutes, 10);
  assert.equal(state.otp.otpHash === emailJob.otp, false);
  assert.equal(state.otp.emailStatus, "SMTP_ACCEPTED");
  assert.equal(JSON.stringify(result).includes(emailJob.otp), false);
  assert.equal("otp" in result, false);
  assert.equal(result.emailStatus, "SMTP_ACCEPTED");
  assert.equal(result.emailHint, "r***@example.test");
  assert.equal(JSON.stringify(result).includes("registered@example.test"), false);
  const status = await work.getCompletionOtpStatus("user-1", "order-1");
  assert.equal(status.emailHint, "r***@example.test");
  assert.equal(JSON.stringify(status).includes("registered@example.test"), false);
});

test("correct OTP completes once, consumes OTP, writes history and preserves notifications", async () => {
  let deliveredCode;
  const { work, state } = fixture({ emailSender: async ({ otp }) => { deliveredCode = otp; return { success: true }; } });
  await work.requestCompletionOtp("user-1", "order-1");
  const completed = await work.markDeliveryCompleted("user-1", "order-1", deliveredCode);
  assert.equal(completed.status, "DELIVERED");
  assert.ok(state.otp.consumedAt);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].toStatus, "DELIVERED");
  assert.equal(state.notifications.filter((item) => item.metadata.kind === "ORDER_STATUS").length, 1);
  assert.equal(state.notifications.filter((item) => item.metadata.kind === "REVIEW_REQUESTED").length, 1);
  assert.equal(state.notifications.filter((item) => item.metadata.kind === "DELIVERY_COMPLETED").length, 1);
});

test("incorrect OTP increments attempts without completing the order", async () => {
  const { work, state } = fixture();
  await work.requestCompletionOtp("user-1", "order-1");
  await assert.rejects(work.markDeliveryCompleted("user-1", "order-1", "000000"), { statusCode: 400 });
  assert.equal(state.order.status, "OUT_FOR_DELIVERY");
  assert.equal(state.otp.attempts, 1);
  assert.equal(state.history.length, 0);
});

test("expired OTP cannot complete the order", async () => {
  const { work, state, advance } = fixture();
  await work.requestCompletionOtp("user-1", "order-1");
  advance(10 * 60 * 1000 + 1);
  await assert.rejects(work.markDeliveryCompleted("user-1", "order-1", "123456"), /expired/i);
  assert.equal(state.order.status, "OUT_FOR_DELIVERY");
  assert.equal(state.history.length, 0);
  assert.ok(state.otp.consumedAt);
});

test("consumed OTP cannot be reused or complete a second time", async () => {
  let code;
  const { work, state } = fixture({ emailSender: async ({ otp }) => { code = otp; return acceptedEmail(); } });
  await work.requestCompletionOtp("user-1", "order-1");
  await work.markDeliveryCompleted("user-1", "order-1", code);
  await assert.rejects(work.markDeliveryCompleted("user-1", "order-1", code), { statusCode: 409 });
  assert.equal(state.history.length, 1);
  assert.equal(state.notifications.filter((item) => item.metadata.kind === "DELIVERY_COMPLETED").length, 1);
});

test("resend cooldown is enforced and a later resend invalidates the prior code", async () => {
  const codes = [];
  const { work, state, advance } = fixture({ emailSender: async ({ otp }) => { codes.push(otp); return acceptedEmail(); } });
  await work.requestCompletionOtp("user-1", "order-1");
  await assert.rejects(work.requestCompletionOtp("user-1", "order-1"), { statusCode: 429 });
  advance(60 * 1000);
  await work.requestCompletionOtp("user-1", "order-1");
  assert.equal(codes.length, 2);
  await assert.rejects(work.markDeliveryCompleted("user-1", "order-1", codes[0]), /incorrect/i);
  assert.equal(state.order.status, "OUT_FOR_DELIVERY");
  assert.equal(state.otp.attempts, 1);
  await work.markDeliveryCompleted("user-1", "order-1", codes[1]);
  assert.equal(state.order.status, "DELIVERED");
});

test("five incorrect attempts lock the code and a subsequent request is rate limited", async () => {
  const { work, state } = fixture();
  await work.requestCompletionOtp("user-1", "order-1");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await assert.rejects(work.markDeliveryCompleted("user-1", "order-1", "000000"), { statusCode: 400 });
  }
  await assert.rejects(work.markDeliveryCompleted("user-1", "order-1", "000000"), { statusCode: 429 });
  assert.equal(state.otp.attempts, 5);
  assert.ok(state.otp.consumedAt);
  assert.equal(state.order.status, "OUT_FOR_DELIVERY");
});

test("another delivery agent cannot request or verify this order's OTP", async () => {
  const { work, state } = fixture();
  await assert.rejects(work.requestCompletionOtp("user-2", "order-1"), { statusCode: 404 });
  assert.equal(state.otp, null);
});

test("email service failure invalidates the code and returns a safe service error", async () => {
  const { work, state } = fixture({ emailSender: async () => { throw new Error("SMTP unavailable"); } });
  await assert.rejects(work.requestCompletionOtp("user-1", "order-1"), { statusCode: 503 });
  assert.equal(state.otp.emailStatus, "FAILED");
  assert.ok(state.otp.consumedAt);
  assert.equal(state.order.status, "OUT_FOR_DELIVERY");
});

test("an email service response without success does not report that a code was sent", async () => {
  const { work, state } = fixture({ emailSender: async () => ({ success: false }) });
  await assert.rejects(work.requestCompletionOtp("user-1", "order-1"), { statusCode: 503 });
  assert.equal(state.otp.emailStatus, "FAILED");
  assert.ok(state.otp.consumedAt);
  assert.equal(state.order.status, "OUT_FOR_DELIVERY");
});

test("concurrent correct submissions complete once and create one delivery history entry", async () => {
  let code;
  const { work, state } = fixture({ emailSender: async ({ otp }) => { code = otp; return acceptedEmail(); } });
  await work.requestCompletionOtp("user-1", "order-1");
  const results = await Promise.allSettled([
    work.markDeliveryCompleted("user-1", "order-1", code),
    work.markDeliveryCompleted("user-1", "order-1", code),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(state.order.status, "DELIVERED");
  assert.equal(state.history.length, 1);
  assert.equal(state.notifications.filter((item) => item.metadata.kind === "DELIVERY_COMPLETED").length, 1);
});


test("another agent cannot verify an assigned agent's OTP", async () => {
  let code;
  const { work, state } = fixture({ emailSender: async ({ otp }) => { code = otp; return acceptedEmail(); } });
  await work.requestCompletionOtp("user-1", "order-1");
  await assert.rejects(work.markDeliveryCompleted("user-2", "order-1", code), { statusCode: 404 });
  assert.equal(state.order.status, "OUT_FOR_DELIVERY");
  assert.equal(state.otp.consumedAt, null);
  assert.equal(state.history.length, 0);
});

test("completion OTP and verify routes require approved delivery-agent authorization and a six-digit body code", async () => {
  const { readFile } = await import("node:fs/promises");
  const routes = await readFile(new URL("../modules/delivery-agent/delivery-agent.routes.js", import.meta.url), "utf8");
  const validation = await readFile(new URL("../modules/delivery-agent/delivery-agent.validation.js", import.meta.url), "utf8");
  assert.match(routes, /\/deliveries\/:orderId\/completion-otp", requireApprovedDeliveryAgent/);
  assert.match(routes, /\/deliveries\/:orderId\/complete", requireApprovedDeliveryAgent, validate\(deliveryCompletionOtpSchema\)/);
  assert.match(validation, /otp: z\.string\(\)\.regex\(\/\^\\d\{6\}\$\//);
});
