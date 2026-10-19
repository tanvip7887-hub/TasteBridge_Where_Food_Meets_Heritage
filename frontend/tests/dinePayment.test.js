import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DINE_PAYMENT_ATTEMPT_LIMIT, dinePaymentState, formatPaymentCountdown, remainingPaymentMilliseconds } from "../src/utils/dinePaymentState.js";
import { createServerClock, readServerClock } from "../src/utils/istDateTime.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const deadline = "2026-10-18T12:15:00.000Z";

test("countdown uses the persisted deadline and does not reset it across refresh calculations", () => {
  const deadlineMs = Date.parse(deadline);
  assert.equal(remainingPaymentMilliseconds(deadline, deadlineMs - 60_000), 60_000);
  assert.equal(remainingPaymentMilliseconds(deadline, deadlineMs - 5_000), 5_000);
  assert.equal(remainingPaymentMilliseconds(deadline, deadlineMs), 0);
  assert.equal(remainingPaymentMilliseconds("invalid", deadlineMs), null);
  assert.equal(remainingPaymentMilliseconds(null, deadlineMs), null);
  assert.equal(remainingPaymentMilliseconds(deadline, null), null);
  assert.equal(formatPaymentCountdown(60_000), "01:00");
  assert.equal(formatPaymentCountdown(3_661_000), "1:01:01");
});

test("payment expiry countdown uses server time and does not trust an inaccurate device wall clock", () => {
  const serverNow = Date.parse("2026-10-18T12:00:00.000Z");
  const paymentDeadline = "2026-10-18T12:15:00.000Z";
  const clock = createServerClock(new Date(serverNow).toISOString(), 10_000, 10_400);
  const estimatedAtResponse = readServerClock(clock, 10_400);
  const estimatedOneMinuteLater = readServerClock(clock, 70_400);
  assert.equal(remainingPaymentMilliseconds(paymentDeadline, estimatedAtResponse), 14 * 60_000 + 59_800);
  assert.equal(remainingPaymentMilliseconds(paymentDeadline, estimatedOneMinuteLater), 13 * 60_000 + 59_800);
  assert.equal(remainingPaymentMilliseconds(paymentDeadline, serverNow + 15 * 60_000), 0);
  assert.equal(dinePaymentState({ status: "ACCEPTED", paymentExpiresAt: paymentDeadline, paymentAttempts: [] }, null).eligible, false);
  assert.equal(dinePaymentState({ status: "ACCEPTED", paymentExpiresAt: "bad", paymentAttempts: [] }, estimatedAtResponse).deadlineValid, false);
});

test("only accepted bookings inside the fixed payment window with attempts remaining are eligible", () => {
  const booking = { status: "ACCEPTED", paymentExpiresAt: deadline, paymentAttempts: [] };
  assert.equal(dinePaymentState(booking, Date.parse("2026-10-18T12:00:00.000Z")).eligible, true);
  assert.equal(dinePaymentState({ ...booking, status: "PENDING" }, Date.parse("2026-10-18T12:00:00.000Z")).eligible, false);
  assert.equal(dinePaymentState(booking, Date.parse(deadline)).eligible, false);
  assert.equal(dinePaymentState({ ...booking, status: "EXPIRED" }, Date.parse("2026-10-18T12:00:00.000Z")).eligible, false);
  assert.equal(dinePaymentState({ ...booking, paymentExpiresAt: null }, Date.parse("2026-10-18T12:00:00.000Z")).deadlineValid, false);
});

test("payment attempt outcomes and the backend three-attempt ceiling are reflected", () => {
  const attempts = [
    { id: "a1", attemptNumber: 1, status: "FAILED", expiresAt: deadline },
    { id: "a2", attemptNumber: 2, status: "PENDING", expiresAt: deadline },
  ];
  const state = dinePaymentState({ status: "ACCEPTED", paymentExpiresAt: deadline, paymentAttempts: attempts }, Date.parse("2026-10-18T12:00:00.000Z"));
  assert.equal(state.attempts.length, 2);
  assert.equal(state.pendingAttempt.id, "a2");
  assert.equal(state.eligible, true);
  const succeeded = dinePaymentState({ status: "CONFIRMED", paymentExpiresAt: deadline, paymentAttempts: [{ id: "a3", status: "SUCCEEDED" }] });
  assert.equal(succeeded.succeeded, true);
  const limited = dinePaymentState({ status: "ACCEPTED", paymentExpiresAt: deadline, paymentAttempts: Array.from({ length: DINE_PAYMENT_ATTEMPT_LIMIT }, (_, index) => ({ id: `a${index}`, status: "FAILED" })) }, Date.parse("2026-10-18T12:00:00.000Z"));
  assert.equal(limited.attemptLimitReached, true);
  assert.equal(limited.eligible, false);
});

test("My Events uses authenticated Dine payment endpoints and waits for server confirmation", async () => {
  const [api, page, backendRoutes, paymentService, historyService] = await Promise.all([
    read("../src/api/eventsApi.js"),
    read("../src/pages/MyEventsPage.jsx"),
    read("../../backend/src/modules/events/customer-events.routes.js"),
    read("../../backend/src/modules/events/dine-payments.service.js"),
    read("../../backend/src/modules/events/customer-events.service.js"),
  ]);
  assert.match(api, /initiateDinePayment: \(bookingId, idempotencyKey\) => api\.post\(`\/events\/bookings\/\$\{encodeURIComponent\(bookingId\)\}\/payment-attempts`, \{ idempotencyKey \}\)/);
  assert.match(api, /confirmDinePayment: \(bookingId, attemptId, mockOutcome\) => api\.post\(`\/events\/bookings\/\$\{encodeURIComponent\(bookingId\)\}\/payment-attempts\/\$\{encodeURIComponent\(attemptId\)\}\/confirm`, \{ mockOutcome \}\)/);
  assert.match(backendRoutes, /router\.post\("\/bookings\/:id\/payment-attempts", validate\(initiateDinePaymentSchema\), initiateMyDineBookingPayment\)/);
  assert.match(backendRoutes, /router\.post\("\/bookings\/:id\/payment-attempts\/:attemptId\/confirm", validate\(confirmDinePaymentSchema\), confirmMyDineBookingPayment\)/);
  assert.match(paymentService, /MAX_PAYMENT_ATTEMPTS = 3/);
  assert.match(paymentService, /booking\.status !== "ACCEPTED"/);
  assert.match(paymentService, /paymentExpiresAt <= now/);
  assert.match(paymentService, /bookingChanged\.count !== 1/);
  assert.match(historyService, /paymentExpiresAt: true/);
  assert.match(historyService, /serverTime: at/);
  assert.match(historyService, /paymentAttempts:/);
  assert.match(page, /eventsApi\.initiateDinePayment\(booking\.id, key\)/);
  assert.match(page, /eventsApi\.confirmDinePayment\(booking\.id, attempt\.id, mockOutcome\)/);
  assert.match(page, /result\.booking\.status/);
  assert.match(page, /actionLock\.current/);
  assert.match(page, /catch \(requestError\)/);
  assert.doesNotMatch(page, /Simulate payment success|Simulate payment failure/);
  assert.match(page, /Pay now/);
  assert.doesNotMatch(page, /CONFIRMED"\s*\}\s*\)\s*\}\)/);
});

test("My Events and Dine checkout reuse the shared Online Payment Module components", async () => {
  const [page, modal, success, failed] = await Promise.all([
    read("../src/pages/MyEventsPage.jsx"),
    read("../src/components/checkout/TasteBridgePayModal.jsx"),
    read("../src/components/checkout/PaymentSuccess.jsx"),
    read("../src/components/checkout/PaymentFailed.jsx"),
  ]);

  // MyEventsPage imports and uses TasteBridgePayModal
  assert.match(page, /import\s*\{\s*TasteBridgePayModal\s*\}\s*from\s*"\.\.\/components\/checkout\/TasteBridgePayModal\.jsx"/);
  assert.match(page, /<TasteBridgePayModal/);
  assert.match(page, /Pay now/);
  assert.match(page, /handleOpenPaymentModal/);
  assert.match(page, /handleModalConfirm/);

  // TasteBridgePayModal reuses the online payment module's method screens
  assert.match(modal, /import\s*\{\s*UpiScreen\s*\}\s*from\s*"\.\/UpiScreen\.jsx"/);
  assert.match(modal, /import\s*\{\s*CardScreen\s*\}\s*from\s*"\.\/CardScreen\.jsx"/);
  assert.match(modal, /import\s*\{\s*NetBankingScreen\s*\}\s*from\s*"\.\/NetBankingScreen\.jsx"/);
  assert.match(modal, /import\s*\{\s*WalletScreen\s*\}\s*from\s*"\.\/WalletScreen\.jsx"/);
  assert.match(modal, /import\s*\{\s*PaymentSuccess\s*\}\s*from\s*"\.\/PaymentSuccess\.jsx"/);
  assert.match(modal, /import\s*\{\s*PaymentFailed\s*\}\s*from\s*"\.\/PaymentFailed\.jsx"/);

  assert.match(modal, /<UpiScreen/);
  assert.match(modal, /<CardScreen/);
  assert.match(modal, /<NetBankingScreen/);
  assert.match(modal, /<WalletScreen/);
  assert.match(modal, /<PaymentSuccess/);
  assert.match(modal, /<PaymentFailed/);

  // Brand header and clear simulated-payment disclosure
  assert.match(modal, /TasteBridge Pay/);
  assert.match(modal, /Simulated checkout only/);
  assert.match(modal, /Record a failed attempt/);
  assert.doesNotMatch(modal, /Simulate Success/);

  // Escape key handler and busy lock
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /if\s*\(paymentBusy\)\s*\{\s*event\.preventDefault\(\);\s*return;\s*\}/);

  // PaymentSuccess and PaymentFailed support Dine custom messaging while retaining food order defaults
  assert.match(success, /actionLabel/);
  assert.match(failed, /backLabel/);
});

