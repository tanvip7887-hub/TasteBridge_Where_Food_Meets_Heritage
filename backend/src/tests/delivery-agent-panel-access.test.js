import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getDeliveryAgentPanelAccess } from "../modules/delivery-agent/delivery-agent.controller.js";
import { deliveryAgentService } from "../modules/delivery-agent/delivery-agent.service.js";

test("panel access response returns the dashboard for the authenticated agent", async () => {
  let statusCode;
  let responseBody;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return body;
    },
  };

  const previous = deliveryAgentService.getPanelDashboard;
  let requestedUserId;
  deliveryAgentService.getPanelDashboard = async (userId) => {
    requestedUserId = userId;
    return { agent: { id: "agent-profile-1" }, metrics: { completedDeliveriesToday: 0 } };
  };
  try {
    await getDeliveryAgentPanelAccess({ user: { id: "authenticated-user" } }, res, (error) => { throw error; });
  } finally {
    deliveryAgentService.getPanelDashboard = previous;
  }

  assert.equal(statusCode, 200);
  assert.equal(requestedUserId, "authenticated-user");
  assert.deepEqual(responseBody.data, { agent: { id: "agent-profile-1" }, metrics: { completedDeliveriesToday: 0 } });
});

test("panel access API is mounted behind authentication and approved-agent authorization", async () => {
  const source = await readFile(new URL("../modules/delivery-agent/delivery-agent.routes.js", import.meta.url), "utf8");
  assert.match(source, /router\.use\(authenticate\)/);
  assert.match(source, /router\.get\(["']\/panel["'],\s*requireApprovedDeliveryAgent,\s*getDeliveryAgentPanelAccess\)/);
  assert.match(source, /router\.patch\([\s\S]*?["']\/availability["'][\s\S]*?requireApprovedDeliveryAgent[\s\S]*?validate\(deliveryAgentAvailabilitySchema\)/);
});
