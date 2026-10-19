import assert from "node:assert/strict";
import test from "node:test";
import {
  getDeliveryAgentReadiness,
  isReadyToWork,
} from "../modules/delivery-agent/delivery-agent-readiness.js";
import { isValidDeliveryAgentPayoutDetails } from "../modules/delivery-agent/delivery-agent.validation.js";
import {
  getDeliveryAgentDashboard,
  setDeliveryAgentAvailability,
} from "../modules/delivery-agent/delivery-agent.service.js";
import { deliveryAgentAvailabilitySchema } from "../modules/delivery-agent/delivery-agent.validation.js";

const now = new Date("2026-10-17T12:00:00.000Z");
const approvedDocs = [
  { id: "id-1", documentType: "IDENTITY_PROOF", verificationStatus: "APPROVED", createdAt: new Date("2026-01-01") },
  { id: "rc-1", documentType: "VEHICLE_REGISTRATION", verificationStatus: "APPROVED", createdAt: new Date("2026-01-01") },
  { id: "dl-1", documentType: "DRIVING_LICENSE", verificationStatus: "APPROVED", createdAt: new Date("2026-01-01") },
];
const readyAgent = (overrides = {}) => ({
  id: "agent-1",
  userId: "user-1",
  vehicleType: "Motorcycle",
  deliveryType: "TWO_WHEELER",
  verificationStatus: "APPROVED",
  isAvailable: false,
  payoutDetails: { verificationStatus: "APPROVED", upiId: "agent@bank", accountHolderName: "Agent Name" },
  user: { role: "DELIVERY_AGENT", status: "ACTIVE", verificationDocuments: approvedDocs },
  ...overrides,
});

test("delivery readiness requires an active approved account, latest required documents, and approved payment details", () => {
  assert.equal(isReadyToWork(readyAgent(), now), true);
  const cases = [
    ["suspended", readyAgent({ user: { role: "DELIVERY_AGENT", status: "SUSPENDED", verificationDocuments: approvedDocs } })],
    ["profile approval missing", readyAgent({ verificationStatus: "PENDING", user: { role: "CUSTOMER", status: "ACTIVE", verificationDocuments: approvedDocs } })],
    ["pending profile", readyAgent({ verificationStatus: "PENDING" })],
    ["payment details missing", readyAgent({ payoutDetails: undefined })],
    ["payout details pending", readyAgent({ payoutDetails: { verificationStatus: "PENDING" } })],
    ["payout details rejected", readyAgent({ payoutDetails: { verificationStatus: "REJECTED", rejectionReason: "Correct the UPI ID." } })],
    ["approved payout missing holder name", readyAgent({ payoutDetails: { verificationStatus: "APPROVED", upiId: "agent@bank" } })],
    ["approved payout has blank holder name", readyAgent({ payoutDetails: { verificationStatus: "APPROVED", upiId: "agent@bank", accountHolderName: "  " } })],
    ["approved payout has invalid UPI ID", readyAgent({ payoutDetails: { verificationStatus: "APPROVED", upiId: "invalid", accountHolderName: "Agent Name" } })],
    ["identity missing", readyAgent({ user: { role: "DELIVERY_AGENT", status: "ACTIVE", verificationDocuments: approvedDocs.slice(1) } })],
    ["vehicle approval pending", readyAgent({ user: { role: "DELIVERY_AGENT", status: "ACTIVE", verificationDocuments: approvedDocs.map((doc) => doc.id === "rc-1" ? { ...doc, verificationStatus: "PENDING" } : doc) } })],
    ["license expired", readyAgent({ user: { role: "DELIVERY_AGENT", status: "ACTIVE", verificationDocuments: approvedDocs.map((doc) => doc.id === "dl-1" ? { ...doc, expiryDate: new Date("2026-10-16") } : doc) } })],
  ];
  for (const [label, agent] of cases) assert.equal(isReadyToWork(agent, now), false, label);
});

test("payout readiness explains pending and rejected account-holder corrections", () => {
  const incompletePending = getDeliveryAgentReadiness(readyAgent({
    payoutDetails: { verificationStatus: "PENDING", upiId: "agent@bank", accountHolderName: " " },
  }), now);
  const pendingAction = incompletePending.pendingRequirements.find(({ id }) => id === "payment-details").action;
  assert.match(pendingAction, /account holder name/i);

  const rejected = getDeliveryAgentReadiness(readyAgent({
    payoutDetails: { verificationStatus: "REJECTED", upiId: "agent@bank", accountHolderName: "Agent Name", rejectionReason: "Use the account name." },
  }), now);
  const rejectedAction = rejected.pendingRequirements.find(({ id }) => id === "payment-details").action;
  assert.match(rejectedAction, /Use the account name/);
  assert.match(rejectedAction, /resubmit/);
});

test("missing payout relation values, including Prisma null, fail closed without crashing readiness", () => {
  assert.equal(isValidDeliveryAgentPayoutDetails(null), false);
  assert.equal(isValidDeliveryAgentPayoutDetails(undefined), false);
  const readiness = getDeliveryAgentReadiness(readyAgent({ payoutDetails: null }), now);
  assert.equal(readiness.readyToWork, false);
  assert.equal(readiness.pendingRequirements.find(({ id }) => id === "payment-details").complete, false);
});

test("a pending replacement document cannot inherit an older approval, including tied timestamps", () => {
  const timestamp = new Date("2026-01-01T00:00:00.000Z");
  const result = getDeliveryAgentReadiness(readyAgent({
    user: {
      role: "DELIVERY_AGENT",
      status: "ACTIVE",
      verificationDocuments: [
        ...approvedDocs,
        { id: "rc-z", documentType: "VEHICLE_REGISTRATION", verificationStatus: "PENDING", createdAt: timestamp },
        { id: "rc-a", documentType: "VEHICLE_REGISTRATION", verificationStatus: "APPROVED", createdAt: timestamp },
      ],
    },
  }), now);
  assert.equal(result.readyToWork, false);
  assert.equal(result.pendingRequirements.find((item) => item.id === "vehicle-registration").complete, false);
});

test("bicycle and walking agents do not require vehicle registration or a driving licence", () => {
  for (const deliveryType of ["BICYCLE", "WALKING"]) {
    const result = getDeliveryAgentReadiness(readyAgent({ deliveryType, vehicleType: deliveryType }), now);
    assert.equal(result.requirements.some((item) => item.id === "vehicle-registration"), false);
    assert.equal(result.requirements.some((item) => item.id === "driving-license"), false);
  }
});

test("dashboard uses only assigned orders and does not invent payout or available-delivery values", async () => {
  const calls = [];
  const database = {
    deliveryAgent: { findUnique: async () => readyAgent({ payoutDetails: null }) },
    address: { findFirst: async () => ({ landmark: JSON.stringify({ deliveryType: "BICYCLE" }) }) },
    order: { findMany: async (query) => {
      calls.push(query);
      if (query.where.status === "DELIVERED") return [{ deliveryEarning: "12.35" }, { deliveryEarning: "7.65" }];
      return [{ id: "order-1", orderNumber: "TB-1", status: "OUT_FOR_DELIVERY", items: [{ name: "Meal", quantity: 2 }] }];
    } },
  };
  const result = await getDeliveryAgentDashboard(database, "user-1", now);
  assert.equal(result.metrics.completedDeliveriesToday, 2);
  assert.equal(result.metrics.deliveryFeesEarnedToday, 20);
  assert.equal(result.metrics.waitingForPayout, null);
  assert.equal(result.metrics.availableDeliveriesCount, null);
  assert.equal(result.capabilities.deliveryAssignmentAvailable, true);
  assert.equal(result.capabilities.earningsAvailable, true);
  assert.equal(result.capabilities.payoutTrackingAvailable, false);
  assert.equal(result.currentDelivery.orderNumber, "TB-1");
  assert.ok(calls.every((query) => query.where.deliveryAgentId === "agent-1"));
  assert.equal(result.agent.isOnline, false);
});

test("backend refuses online availability until every readiness requirement is met", async () => {
  let updateCalls = 0;
  const tx = {
    deliveryAgent: {
      findUnique: async () => readyAgent({ payoutDetails: null }),
      updateMany: async () => { updateCalls += 1; return { count: 1 }; },
    },
    address: { findFirst: async () => ({ landmark: JSON.stringify({ deliveryType: "BICYCLE" }) }) },
  };
  const database = { $transaction: async (callback) => callback(tx) };
  await assert.rejects(setDeliveryAgentAvailability(database, "user-1", true), { statusCode: 409 });
  assert.equal(updateCalls, 0);
});

test("an agent may always switch offline, and availability input is strict", async () => {
  let update;
  const database = {
    deliveryAgent: {
      findUnique: async () => ({ id: "agent-1" }),
      updateMany: async (query) => { update = query; return { count: 1 }; },
    },
  };
  assert.deepEqual(await setDeliveryAgentAvailability(database, "user-1", false), { isAvailable: false });
  assert.equal(update.where.userId, "user-1");
  assert.deepEqual(update.data, { isAvailable: false });
  assert.equal(deliveryAgentAvailabilitySchema.body.safeParse({ isAvailable: true }).success, true);
  assert.equal(deliveryAgentAvailabilitySchema.body.safeParse({ isAvailable: "true" }).success, false);
  assert.equal(deliveryAgentAvailabilitySchema.body.safeParse({ isAvailable: true, paymentStatus: "PAID" }).success, false);
});
