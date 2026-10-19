import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("CustomerReviewForm implements rating requirement, character counter, skip, loading, error, success, and duplicate states", async () => {
  const formCode = await read("../src/components/reviews/CustomerReviewForm.jsx");

  // Required 1-5 star rating
  assert.match(formCode, /role="radiogroup"/);
  assert.match(formCode, /role="radio"/);
  assert.match(formCode, /Please select a star rating between 1 and 5\./);
  assert.match(formCode, /aria-label="Rating out of 5 stars"/);

  // Optional comment max 500 chars
  assert.match(formCode, /maxLength=\{500\}/);
  assert.match(formCode, /comment\.length\s*>\s*500/);
  assert.match(formCode, /\{comment\.length\}\/500/);

  // Submit and Skip actions
  assert.match(formCode, /onClick=\{onSkip\}/);
  assert.match(formCode, /Skip for now/);
  assert.match(formCode, /Submit review/);

  // Loading state
  assert.match(formCode, /saving && <LoaderCircle/);
  assert.match(formCode, /disabled=\{saving\}/);
  assert.match(formCode, /Saving…/);

  // API error state
  assert.match(formCode, /role="alert"/);
  assert.match(formCode, /apiError/);

  // Duplicate-review state
  assert.match(formCode, /status === 409/);
  assert.match(formCode, /already been reviewed/i);
  assert.match(formCode, /Already reviewed/);
  assert.match(formCode, /duplicate submissions are prevented/i);

  // Success state
  assert.match(formCode, /role="status"/);
  assert.match(formCode, /Thank you for your feedback!/);
  assert.match(formCode, /Done/);

  // Contract compliance: FOOD vs EXPERIENCE payloads
  assert.match(formCode, /reviewType:\s*"FOOD"/);
  assert.match(formCode, /orderItemId/);
  assert.match(formCode, /reviewType:\s*"EXPERIENCE"/);
  assert.match(formCode, /bookingId/);
});

test("CustomerReviewModal wraps CustomerReviewForm with dialog accessibility and escape key handling", async () => {
  const modalCode = await read("../src/components/reviews/CustomerReviewModal.jsx");

  assert.match(modalCode, /role="dialog"/);
  assert.match(modalCode, /aria-modal="true"/);
  assert.match(modalCode, /aria-labelledby="review-modal-title"/);
  assert.match(modalCode, /e\.key === "Escape"/);
  assert.match(modalCode, /<CustomerReviewForm/);
});

test("usePendingReviews hook fetches pending reviews and enforces backend eligibility checks", async () => {
  const hookCode = await read("../src/components/reviews/usePendingReviews.js");

  assert.match(hookCode, /reviewsApi\.pending/);
  assert.match(hookCode, /reviewsApi\.pending\(\{\s*page:\s*1,\s*limit:\s*50\s*\}\)/);
  assert.match(hookCode, /getPendingFoodItem/);
  assert.match(hookCode, /getPendingOrderItems/);
  assert.match(hookCode, /getPendingBookingItem/);
  assert.match(hookCode, /isFoodItemEligible/);
  assert.match(hookCode, /isOrderEligible/);
  assert.match(hookCode, /isBookingEligible/);
  assert.match(hookCode, /reviewType === "FOOD"/);
  assert.match(hookCode, /reviewType === "EXPERIENCE"/);
});

test("CustomerOrdersPage displays review entry point only when order is eligible via backend", async () => {
  const ordersPageCode = await read("../src/pages/CustomerOrdersPage.jsx");

  assert.match(ordersPageCode, /usePendingReviews/);
  assert.match(ordersPageCode, /getPendingOrderItems/);
  assert.match(ordersPageCode, /order\.status === "DELIVERED" && eligibleReviews\.length > 0/);
  assert.match(ordersPageCode, /<CustomerReviewModal/);
  assert.match(ordersPageCode, /refreshPending/);
});

test("CustomerOrderDetailPage displays item-level and order-level review entry points when eligible", async () => {
  const detailPageCode = await read("../src/pages/CustomerOrderDetailPage.jsx");

  assert.match(detailPageCode, /usePendingReviews/);
  assert.match(detailPageCode, /getPendingFoodItem/);
  assert.match(detailPageCode, /pendingFoodItem && <button/);
  assert.match(detailPageCode, /Rate dish/);
  assert.match(detailPageCode, /Review purchased dishes/);
  assert.match(detailPageCode, /<CustomerReviewModal/);
});

test("MyEventsPage displays experience review entry point only when completed booking is eligible", async () => {
  const eventsPageCode = await read("../src/pages/MyEventsPage.jsx");

  assert.match(eventsPageCode, /usePendingReviews/);
  assert.match(eventsPageCode, /getPendingBookingItem/);
  assert.match(eventsPageCode, /booking\.status === "COMPLETED" && pendingItem && onReview/);
  assert.match(eventsPageCode, /Review this experience/);
  assert.match(eventsPageCode, /<CustomerReviewModal/);
});

test("CustomerReviewsPage integrates reusable CustomerReviewModal and refreshes after submission", async () => {
  const reviewsPageCode = await read("../src/pages/CustomerReviewsPage.jsx");

  assert.match(reviewsPageCode, /<CustomerReviewModal/);
  assert.match(reviewsPageCode, /modalTarget/);
  assert.match(reviewsPageCode, /void load\(\)/);
});
