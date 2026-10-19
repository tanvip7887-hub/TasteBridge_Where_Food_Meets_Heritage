import assert from "node:assert/strict";
import test from "node:test";
import { createAdminWorkshopReviewService } from "../modules/admin/admin.service.js";
import { reviewWorkshopSchema } from "../modules/admin/admin.validation.js";

const now = new Date("2026-10-19T12:00:00.000Z");
const fixture = (initial) => {
  const row = structuredClone({
    title: "Workshop", theme: "Regional cooking", description: "A detailed workshop description.",
    teachingContent: "Prepare and cook a regional meal.", learningOutcomes: "Learn core cooking techniques.",
    image: "https://images.example.test/workshop.jpg", pricePerPerson: 500, publicArea: "Pune",
    privateAddress: "12 Example Road, Pune", addressSource: "CUSTOM",
    slots: [{ id: "slot-1", status: "OPEN", startsAt: new Date("2026-10-21T12:00:00Z"), endsAt: new Date("2026-10-21T14:00:00Z"), availableSeats: 4, capacity: 4 }],
    ...initial,
  });
  const tx = {
    experience: {
      findFirst: async ({ where }) => row.id === where.id && row.type === where.type && row.status === where.status ? row : null,
      updateMany: async ({ where, data }) => {
        if (row.id !== where.id || row.type !== where.type || row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      findUnique: async () => structuredClone(row),
    },
  };
  return { row, service: createAdminWorkshopReviewService({ $transaction: async (callback) => callback(tx) }, { now: () => now, isCookEligible: () => true }) };
};

test("Admin approval publishes only a pending workshop for customer discovery", async () => {
  const { row, service } = fixture({ id: "workshop-1", type: "WORKSHOP", status: "PENDING", reviewRejectionReason: "old feedback" });
  const result = await service.review("workshop-1", { action: "APPROVE" });
  assert.equal(result.status, "PUBLISHED");
  assert.equal(result.reviewRejectionReason, null);
  assert.equal(row.status, "PUBLISHED");
});

test("Admin rejection stores the reason and stale or non-workshop records cannot be reviewed", async () => {
  const { row, service } = fixture({ id: "workshop-1", type: "WORKSHOP", status: "PENDING", reviewRejectionReason: null });
  const reason = "Please add a clearer schedule.";
  const parsed = reviewWorkshopSchema.body.parse({ action: "REJECT", rejectionReason: reason });
  const result = await service.review("workshop-1", parsed);
  assert.equal(result.status, "REJECTED");
  assert.equal(result.reviewRejectionReason, reason);
  await assert.rejects(service.review("workshop-1", { action: "APPROVE" }), { statusCode: 409 });

  const dineFixture = fixture({ id: "dine-1", type: "HOME_DINING", status: "PENDING" });
  await assert.rejects(dineFixture.service.review("dine-1", { action: "APPROVE" }), { statusCode: 409 });
  assert.equal(row.status, "REJECTED");
});

test("Admin cannot publish a workshop with missing learning details, image, or future capacity", async () => {
  for (const patch of [
    { learningOutcomes: null },
    { image: null },
    { slots: [] },
  ]) {
    const { row, service } = fixture({ id: "workshop-invalid", type: "WORKSHOP", status: "PENDING", ...patch });
    await assert.rejects(service.review("workshop-invalid", { action: "APPROVE" }), { statusCode: 409 });
    assert.equal(row.status, "PENDING");
  }
});

test("workshop rejection requires an actionable reason", () => {
  assert.equal(reviewWorkshopSchema.body.safeParse({ action: "REJECT" }).success, false);
  assert.equal(reviewWorkshopSchema.body.safeParse({ action: "REJECT", rejectionReason: "no" }).success, false);
  assert.equal(reviewWorkshopSchema.body.safeParse({ action: "APPROVE" }).success, true);
});
