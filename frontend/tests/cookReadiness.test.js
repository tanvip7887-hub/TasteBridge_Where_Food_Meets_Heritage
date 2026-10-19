import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCookReadiness } from "../src/utils/cookReadiness.js";

test("Cook Home presentation reads ready and pending states from the API response", () => {
  const ready = normalizeCookReadiness({
    readyToSell: true,
    checklist: [{ id: "fssai-certificate", label: "FSSAI certificate", complete: true, message: "Approved.", actionHref: "/cook/profile" }],
  });
  assert.equal(ready.heading, "Ready to sell");
  assert.equal(ready.showChecklist, false);
  assert.equal(ready.checklist[0].complete, true);

  const pending = normalizeCookReadiness({
    readyToSell: false,
    checklist: [{ id: "fssai-certificate", label: "FSSAI certificate", complete: false, message: "Waiting for review.", actionHref: "/cook/profile" }],
  });
  assert.equal(pending.heading, "Setup incomplete");
  assert.equal(pending.showChecklist, true);
  assert.equal(pending.checklist[0].complete, false);
  assert.equal(pending.checklist[0].actionHref, "/cook/profile");
});

test("Cook Home does not invent readiness when the dashboard contract is missing", () => {
  assert.equal(normalizeCookReadiness(null), null);
  assert.equal(normalizeCookReadiness({ checklist: [] }), null);
});
