import assert from "node:assert/strict";
import test from "node:test";
import { getReviewImage } from "./bookingPresentation.js";
import { getPendingReviewStatus, getReviewStatusLabel, getReviewTabCount } from "./reviewPresentation.js";

test("review tab badges use complete loaded results or unfiltered server totals", () => {
  const loaded = [{ id: "one" }, { id: "two" }];
  assert.equal(getReviewTabCount(loaded, { totalPages: 1, total: 8 }, { filterActive: true }), 2);
  assert.equal(getReviewTabCount(loaded, { totalPages: 1, total: 2 }), 2);
  assert.equal(getReviewTabCount(loaded, { totalPages: 3, total: 27 }), 27);
  assert.equal(getReviewTabCount(loaded, { totalPages: 3, total: 27 }, { filterActive: true }), null);
  assert.equal(getReviewTabCount([], { totalPages: 0, total: 0 }), 0);
  assert.equal(getReviewTabCount(loaded, null), null);
});

test("pending and submitted review chips map only the approved existing states", () => {
  assert.equal(getPendingReviewStatus({ reviewType: "FOOD", deliveredAt: "2026-10-20" }), "Delivered");
  assert.equal(getPendingReviewStatus({ reviewType: "EXPERIENCE", completedAt: "2026-10-20" }), "Completed");
  assert.equal(getPendingReviewStatus({ reviewType: "FOOD" }), null);
  assert.equal(getPendingReviewStatus({ reviewType: "EXPERIENCE" }), null);
  assert.equal(getReviewStatusLabel("PUBLISHED"), "Visible");
  assert.equal(getReviewStatusLabel("HIDDEN"), "Hidden");
  assert.equal(getReviewStatusLabel("REMOVED"), "Removed");
  assert.equal(getReviewStatusLabel("UNRECOGNIZED"), "Status unavailable");
});

test("review images prefer dish or experience image, then kitchen photo, then placeholder", () => {
  const food = getReviewImage({
    reviewType: "FOOD",
    subjectName: "Puran Poli",
    dishImageUrl: "https://res.cloudinary.com/tastebridge/image/upload/v1/dish.jpg",
    experienceImageUrl: "https://images.example.com/unused-event.jpg",
    kitchenPhotoUrl: "https://images.example.com/kitchen.jpg",
  });
  assert.deepEqual(food, [
    { src: "https://res.cloudinary.com/tastebridge/image/upload/w_400,c_limit,f_auto,q_auto/v1/dish.jpg", alt: "Photo of Puran Poli" },
    { src: "https://images.example.com/kitchen.jpg", alt: "Cook kitchen" },
    { src: null, alt: "", placeholder: true, placeholderType: "food" },
  ]);

  const event = getReviewImage({
    reviewType: "EXPERIENCE",
    experienceImageUrl: "https://images.example.com/event.jpg",
    kitchenPhotoUrl: "https://images.example.com/kitchen.jpg",
  });
  assert.equal(event[0].src, "https://images.example.com/event.jpg");
  assert.deepEqual(event.at(-1), { src: null, alt: "", placeholder: true, placeholderType: "event" });
  assert.deepEqual(getReviewImage({ reviewType: "FOOD", dishImageUrl: "http://localhost/private.jpg" }), [
    { src: null, alt: "", placeholder: true, placeholderType: "food" },
  ]);
});

test("review card keeps the full flow data and labels Cook replies from public kitchen context", async () => {
  const { readFile } = await import("node:fs/promises");
  const card = await readFile(new URL("../components/reviews/ReviewCard.jsx", import.meta.url), "utf8");
  assert.match(card, /onWrite\(item\)/);
  assert.match(card, /item\.editable &&/);
  assert.match(card, /onEdit\(item\)/);
  assert.match(card, /Reply from \{kitchenName \|\| item\.cookName \|\| "Cook"\}/);
  assert.match(card, /getPendingReviewStatus/);
  assert.match(card, /getReviewStatusLabel/);
});
