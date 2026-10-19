import assert from "node:assert/strict";
import test from "node:test";
import { persistDeliveryAgentVerificationTransition } from "../modules/admin/admin.service.js";

const initialState = () => ({
  user: { id: "user-agent-1", role: "CUSTOMER" },
  agent: { id: "agent-1", verificationStatus: "PENDING", isAvailable: false },
  document: { verificationStatus: "PENDING" },
});

const transactionalClient = (state, { failAgentUpdate = false } = {}) => ({
  async $transaction(callback) {
    const working = structuredClone(state);
    const tx = {
      user: {
        async update({ data }) {
          Object.assign(working.user, data);
        },
      },
      deliveryAgent: {
        async update({ data }) {
          if (failAgentUpdate) throw new Error("simulated agent profile write failure");
          Object.assign(working.agent, data);
          return { ...working.agent, user: { ...working.user } };
        },
      },
      verificationDocument: {
        async updateMany({ data }) {
          Object.assign(working.document, data);
        },
      },
    };

    const result = await callback(tx);
    Object.assign(state.user, working.user);
    Object.assign(state.agent, working.agent);
    Object.assign(state.document, working.document);
    return result;
  },
});

test("delivery-agent approval promotes the role and profile atomically", async () => {
  const state = initialState();
  const result = await persistDeliveryAgentVerificationTransition(
    transactionalClient(state),
    { id: "agent-1", userId: "user-agent-1" },
    "APPROVED"
  );

  assert.equal(state.user.role, "DELIVERY_AGENT");
  assert.equal(state.agent.verificationStatus, "APPROVED");
  assert.equal(state.document.verificationStatus, "APPROVED");
  assert.equal(result.user.role, "DELIVERY_AGENT");
});

test("rejection revokes the delivery-agent role and availability", async () => {
  const state = initialState();
  state.user.role = "DELIVERY_AGENT";
  state.agent.verificationStatus = "APPROVED";
  state.agent.isAvailable = true;

  await persistDeliveryAgentVerificationTransition(
    transactionalClient(state),
    { id: "agent-1", userId: "user-agent-1" },
    "REJECTED"
  );

  assert.equal(state.user.role, "CUSTOMER");
  assert.equal(state.agent.verificationStatus, "REJECTED");
  assert.equal(state.agent.isAvailable, false);
  assert.equal(state.document.verificationStatus, "PENDING");
});

test("failed delivery-agent profile write does not partially change the role", async () => {
  const state = initialState();

  await assert.rejects(
    persistDeliveryAgentVerificationTransition(
      transactionalClient(state, { failAgentUpdate: true }),
      { id: "agent-1", userId: "user-agent-1" },
      "APPROVED"
    ),
    /simulated agent profile write failure/
  );

  assert.deepEqual(state, initialState());
});
