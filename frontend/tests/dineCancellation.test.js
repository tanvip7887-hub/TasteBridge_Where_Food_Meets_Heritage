import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dineCancellationState } from "../src/utils/dineCancellationState.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const cutoff = Date.parse("2026-11-13T12:00:00.000Z");

test("only server-eligible pending and accepted bookings can be cancelled before their persisted expiry", () => {
  const pending = { status: "PENDING", cancellation: { eligible: true, deadlineAt: new Date(cutoff) } };
  const accepted = { status: "ACCEPTED", cancellation: { eligible: true, deadlineAt: new Date(cutoff) } };
  assert.equal(dineCancellationState(pending, cutoff - 1).eligible, true);
  assert.equal(dineCancellationState(accepted, cutoff - 1).eligible, true);
  assert.equal(dineCancellationState(pending, cutoff).eligible, false);
  assert.equal(dineCancellationState({ ...accepted, cancellation: { eligible: false, deadlineAt: new Date(cutoff) } }, cutoff - 1).eligible, false);
});

test("confirmed cancellation uses the server-provided configured cutoff and includes its exact boundary", () => {
  const booking = { status: "CONFIRMED", cancellation: { eligible: true, deadlineAt: new Date(cutoff) } };
  assert.equal(dineCancellationState(booking, cutoff).eligible, true);
  assert.equal(dineCancellationState(booking, cutoff + 1).eligible, false);
  assert.equal(dineCancellationState({ ...booking, cancellation: { eligible: false, deadlineAt: new Date(cutoff) } }, cutoff - 1).eligible, false);
});

test("an eligible paid confirmed booking remains cancellable in My Events while the server cutoff is active", async () => {
  const serverEligible = {
    status: "CONFIRMED",
    paymentAttempts: [{ status: "SUCCEEDED" }],
    cancellation: { eligible: true, deadlineAt: new Date(cutoff), reason: null },
  };
  const state = dineCancellationState(serverEligible, cutoff - 1);
  assert.equal(state.eligible, true);

  const withinProhibitedWindow = dineCancellationState({
    ...serverEligible,
    cancellation: {
      eligible: false,
      deadlineAt: new Date(cutoff),
      reason: "The cancellation window has closed. Requests must be made at least 48 hours before the experience starts.",
    },
  }, cutoff - 1);
  assert.equal(withinProhibitedWindow.eligible, false);
  assert.match(withinProhibitedWindow.reason, /at least 48 hours/);

  const page = await read("../src/pages/MyEventsPage.jsx");
  assert.match(page, /state\.eligible \? \(/);
  assert.match(page, /Cancel booking/);
  assert.doesNotMatch(page, /bookingDate\).*48\s*\*\s*60\s*\*\s*60/);
  assert.doesNotMatch(page, /result\.booking\.status === "CONFIRMED"[\s\S]{0,250}48\s*\*\s*60\s*\*\s*60/);
});

test("confirmed cancellation fails closed on stale or missing server eligibility instead of inventing a 48h cutoff", () => {
  const eventDate = new Date("2026-11-20T12:00:00.000Z");
  const paymentExpiredAt = new Date("2026-10-18T12:15:00.000Z");

  // Stale payment deadline carried over from ACCEPTED state
  const staleConfirmed = {
    status: "CONFIRMED",
    bookingDate: eventDate,
    paymentExpiresAt: paymentExpiredAt,
    cancellation: { eligible: false, deadlineAt: paymentExpiredAt },
  };
  const activeNow = new Date("2026-11-10T12:00:00.000Z").getTime();
  const state = dineCancellationState(staleConfirmed, activeNow);
  assert.equal(state.eligible, false);

  // Missing server cancellation data is not reconstructed from bookingDate or a hard-coded policy.
  const missingDeadline = {
    status: "CONFIRMED",
    bookingDate: eventDate,
  };
  const fallbackState = dineCancellationState(missingDeadline, activeNow);
  assert.equal(fallbackState.eligible, false);
  assert.equal(fallbackState.deadline, null);
  assert.match(fallbackState.reason, /Refresh your bookings/);
});

test("terminal booking states and missing cutoff data hide cancellation", () => {
  for (const status of ["COMPLETED", "REJECTED", "EXPIRED", "CANCELLED"]) {
    assert.equal(dineCancellationState({ status, cancellation: { eligible: true, deadlineAt: new Date(cutoff) } }, cutoff - 1).eligible, false);
  }
  assert.equal(dineCancellationState({ status: "CONFIRMED", cancellation: { eligible: true } }, cutoff - 1).eligible, false);
  assert.equal(dineCancellationState({ status: "CONFIRMED", cancellation: { eligible: true, deadlineAt: null } }, cutoff - 1).eligible, false);
});

test("cancellation state provides explicit reasons and handles null or uninitialized clock safely", () => {
  const future = new Date(Date.now() + 100_000);
  const past = new Date(Date.now() - 100_000);

  // Safe fallback when now is null
  const pendingFuture = { status: "PENDING", cancellation: { eligible: true, deadlineAt: future } };
  const nullNowState = dineCancellationState(pendingFuture, null);
  assert.equal(nullNowState.eligible, true);
  assert.equal(nullNowState.deadline instanceof Date, true);

  // Pending expired reason
  const pendingExpired = { status: "PENDING", cancellation: { eligible: true, deadlineAt: past } };
  const expiredHold = dineCancellationState(pendingExpired);
  assert.equal(expiredHold.eligible, false);
  assert.match(expiredHold.reason, /Booking hold has expired/);

  // Accepted expired reason
  const acceptedExpired = { status: "ACCEPTED", cancellation: { eligible: true, deadlineAt: past } };
  const expiredPayment = dineCancellationState(acceptedExpired);
  assert.equal(expiredPayment.eligible, false);
  assert.match(expiredPayment.reason, /Payment deadline has expired/);

  // Confirmed past cutoff reason
  const confirmedPastCutoff = { status: "CONFIRMED", cancellation: { eligible: false, deadlineAt: past } };
  const cutoffPassed = dineCancellationState(confirmedPastCutoff);
  assert.equal(cutoffPassed.eligible, false);
  assert.match(cutoffPassed.reason, /Cancellation cutoff has passed/);

  // Terminal states provide descriptive reasons
  assert.match(dineCancellationState({ status: "CANCELLED" }).reason, /already cancelled/);
  assert.match(dineCancellationState({ status: "COMPLETED" }).reason, /Completed bookings cannot be cancelled/);
});

test("cancellation request awaiting Cook review is not cancellable again and displays pending status", () => {
  const pendingReview = {
    status: "CONFIRMED",
    cancellationStatus: "PENDING",
    cancellationReason: "Change of plans",
    cancellation: { eligible: true, deadlineAt: new Date(cutoff) },
  };
  const state = dineCancellationState(pendingReview, cutoff - 1000);
  assert.equal(state.eligible, false);
  assert.equal(state.isPendingApproval, true);
  assert.match(state.reason, /awaiting Cook review/i);
});

test("My Events requires cancellation reason, calls the owner-scoped cancellation request endpoint, and handles review state", async () => {
  const [api, page, bookingCard, historyService, cancellationService] = await Promise.all([
    read("../src/api/eventsApi.js"),
    read("../src/pages/MyEventsPage.jsx"),
    read("../src/components/bookings/BookingCard.jsx"),
    read("../../backend/src/modules/events/customer-events.service.js"),
    read("../../backend/src/modules/events/dine-cancellations.service.js"),
  ]);
  assert.match(api, /cancelDineBooking: \(bookingId, reason\) => api\.post\(`\/events\/bookings\/\$\{encodeURIComponent\(bookingId\)\}\/cancel`, \{ reason \}\)/);
  assert.match(page, /role="dialog"[\s\S]*Submit cancellation request/);
  assert.match(page, /eventsApi\.cancelDineBooking\(booking\.id, trimmed\)/);
  assert.match(page, /Reason for cancellation/);
  assert.match(page, /cancellationReasonError/);
  assert.match(page, /Please enter a cancellation reason of at least 5 characters/);
  assert.match(page, /Cancellation requested · Awaiting Cook review/);
  assert.match(page, /The Cook declined your previous cancellation request/);
  assert.match(page, /cancellationLock\.current/);
  assert.match(page, /await load\(\)/);
  assert.match(page, /The Cook has been notified to review your request/);
  assert.match(page, /requestError\?\.response\?\.data\?\.message/);
  assert.match(page, /state\.reason \|\|/);
  const workshopCard = bookingCard.slice(bookingCard.indexOf("if (isWorkshop)"), bookingCard.indexOf("\n  const reference", bookingCard.indexOf("if (isWorkshop)")));
  assert.doesNotMatch(workshopCard, /availableSeats/);
  assert.match(historyService, /cancellation: cancellationSummary/);
  assert.match(historyService, /cancellationRequestedAt/);
  assert.match(historyService, /experienceCancellationWindowHours/);
  assert.match(historyService, /cancellation window has closed[\s\S]*\$\{cancellationWindowHours\} hours/);
  assert.match(historyService, /realMoneyReturned: false/);
  assert.match(historyService, /availableSeats: booking\.slot\?\.availableSeats/);
  assert.match(bookingCard, /Simulated refund \{statusLabel\(booking\.refund\.status\)\}/);
  assert.match(bookingCard, /No real money was returned/);
  assert.match(bookingCard, /The booking expired before the Cook reviewed the cancellation request/);
  assert.match(page, /booking remains \{statusLabel\(booking\.status\)\.toLowerCase\(\)\}/);
  assert.match(cancellationService, /WHERE "id" = \$\{bookingId\} AND "customerId" = \$\{customerId\}/);
  assert.match(cancellationService, /requestCancellation/);
  assert.match(cancellationService, /approveCancellation/);
  assert.match(cancellationService, /rejectCancellation/);
});

test("My Events does not hard-code the cancellation window or override server ineligibility", async () => {
  const [state, page] = await Promise.all([
    read("../src/utils/dineCancellationState.js"),
    read("../src/pages/MyEventsPage.jsx"),
  ]);
  assert.doesNotMatch(state, /48\s*\*\s*60\s*\*\s*60/);
  assert.match(state, /booking\?\.cancellation\?\.eligible !== true/);
  assert.match(state, /booking\?\.cancellation\?\.reason/);
  assert.doesNotMatch(page, /bookingDate\).*48\s*\*\s*60\s*\*\s*60/);
});
