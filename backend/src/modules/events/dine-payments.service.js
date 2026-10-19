import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { currencyNumber, normalizeCurrency, toPaise } from "../../utils/money.js";
import { simulatedPaymentProvider } from "../payments/simulatedPayment.provider.js";
import { createNotificationsService } from "../notifications/notifications.service.js";
import {
  expireDueBookingsForSlot,
  isRetryableDineTransactionError,
  runSerializableWithRetry,
} from "./dine-booking-expiry.service.js";

const PAYMENT_CURRENCY = "INR";
const MAX_PAYMENT_ATTEMPTS = 3;

const notFound = () => new AppError("Experience booking not found.", HTTP_STATUS.NOT_FOUND);
const conflict = (message) => new AppError(message, HTTP_STATUS.CONFLICT);
const unavailable = () => new AppError(
  "Dine payment initiation is unavailable. No payment attempt was created.",
  HTTP_STATUS.SERVICE_UNAVAILABLE,
);

const paymentAttemptInclude = {
  paymentAttempts: { orderBy: [{ attemptNumber: "asc" }, { id: "asc" }] },
  slot: { select: { id: true, capacity: true, availableSeats: true, status: true } },
  experience: { select: { id: true, type: true, title: true, cook: { select: { userId: true } } } },
};
const ACTIVE_CAPACITY_BOOKING_STATUSES = ["PENDING", "ACCEPTED", "CONFIRMED"];

const notifyCookPaymentConfirmed = (tx, notificationServiceFactory, booking) => notificationServiceFactory(tx).create({
  userId: booking.experience.cook.userId,
  portal: "COOK",
  type: "ORDER_ALERT",
  title: booking.experience.type === "WORKSHOP" ? "Workshop booking payment confirmed" : "Dine booking payment confirmed",
  message: `Payment was confirmed for ${booking.experience.title}. The booking is now confirmed.`,
  metadata: {
    kind: "EXPERIENCE_BOOKING_PAYMENT_CONFIRMED",
    bookingId: booking.id,
    experienceId: booking.experienceId,
    href: booking.experience.type === "WORKSHOP" ? "/cook/workshop-bookings" : "/cook/dine-bookings",
  },
  eventKey: `experience-booking:${booking.id}:payment-confirmed:cook:${booking.experience.cook.userId}`,
});

const serializeAttempt = (attempt, { reused = false } = {}) => ({
  id: attempt.id,
  attemptNumber: attempt.attemptNumber,
  reference: attempt.reference,
  provider: attempt.provider,
  status: attempt.status,
  verificationMode: attempt.verificationMode,
  amount: currencyNumber(attempt.amount),
  currency: attempt.currency,
  expiresAt: attempt.expiresAt,
  createdAt: attempt.createdAt,
  succeededAt: attempt.succeededAt || null,
  simulated: attempt.provider === "SIMULATED",
  reused,
});

const serializeConfirmation = (booking, attempt, { reused = false } = {}) => ({
  booking: { id: booking.id, status: booking.status, paymentExpiresAt: booking.paymentExpiresAt },
  paymentAttempt: serializeAttempt(attempt, { reused }),
  simulated: true,
});

const loadOwnedBooking = async (tx, bookingId, customerId) => tx.experienceBooking.findFirst({
  where: { id: bookingId, customerId },
  include: paymentAttemptInclude,
});

const lockOwnedBooking = async (tx, bookingId, customerId) => {
  const locked = await tx.$queryRaw`
    SELECT "id" FROM "ExperienceBooking"
    WHERE "id" = ${bookingId} AND "customerId" = ${customerId}
    FOR UPDATE
  `;
  if (locked.length !== 1) throw notFound();
  const booking = await loadOwnedBooking(tx, bookingId, customerId);
  if (!booking) throw notFound();
  return booking;
};

const validateBookingForPayment = (booking, now) => {
  if (booking.cancellationStatus === "PENDING") {
    throw conflict("Payment is paused while the Cook reviews your cancellation request.");
  }
  if (booking.status !== "ACCEPTED") throw conflict("Only Cook-accepted bookings can start payment.");
  if (!booking.acceptedAt || !(booking.paymentExpiresAt instanceof Date)) {
    throw conflict("This accepted booking has no valid payment deadline and requires review.");
  }
  if (booking.paymentExpiresAt <= now) throw conflict("The booking payment window has expired.");

  if (booking.totalAmountSnapshot === null || booking.totalAmountSnapshot === undefined) {
    throw conflict("This booking has no payable amount snapshot and requires review.");
  }
  let amount;
  try { amount = normalizeCurrency(booking.totalAmountSnapshot); }
  catch { throw conflict("This booking has an invalid payable amount snapshot."); }
  if (toPaise(amount) <= 0n) throw conflict("This booking has an invalid payable amount snapshot.");
  return { amount, currency: PAYMENT_CURRENCY, expiresAt: booking.paymentExpiresAt };
};

const chooseExistingAttempt = (booking, idempotencyKey, now) => {
  const attempts = booking.paymentAttempts || [];
  const sameKey = attempts.find((attempt) => attempt.idempotencyKey === idempotencyKey);
  if (sameKey) return sameKey;
  return attempts.find((attempt) => attempt.status === "PENDING" && attempt.expiresAt > now) || null;
};

const assertAttemptCapacity = (attempts) => {
  if (attempts.length >= MAX_PAYMENT_ATTEMPTS) {
    throw conflict("The maximum of three payment attempts for this booking has been reached.");
  }
};

const validProviderIntent = (intent, expected) => {
  if (!intent || intent.method !== "SIMULATED" || intent.status !== "PENDING"
    || typeof intent.reference !== "string" || intent.reference.length < 1
    || typeof intent.currency !== "string" || intent.currency !== expected.currency
    || !(intent.expiresAt instanceof Date) || intent.expiresAt.getTime() !== expected.expiresAt.getTime()) return false;
  try { return normalizeCurrency(intent.amount) === expected.amount; }
  catch { return false; }
};

const validProviderResult = (result, reference) => result?.reference === reference
  && ["SUCCEEDED", "FAILED"].includes(result?.status);

export const createDinePaymentsService = (
  database,
  {
    now = () => new Date(),
    paymentProvider = simulatedPaymentProvider,
    allowMockPayments = process.env.NODE_ENV !== "production",
    notificationServiceFactory = createNotificationsService,
  } = {},
) => ({
  async initiatePayment(customerId, bookingId, idempotencyKey) {
    if (!customerId) throw new AppError("Customer account access is required.", HTTP_STATUS.FORBIDDEN);
    if (!allowMockPayments) throw unavailable();
    if (typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
      throw new AppError("An idempotency key is required.", HTTP_STATUS.BAD_REQUEST);
    }

    // Read and lock first so existing retries avoid creating even a simulated
    // provider intent. The lock is released before invoking provider code.
    const preflight = await runSerializableWithRetry(database, async (tx) => {
      const booking = await lockOwnedBooking(tx, bookingId, customerId);
      const at = now();
      const existing = chooseExistingAttempt(booking, idempotencyKey, at);
      if (existing) return { existing: serializeAttempt(existing, { reused: true }) };

      const expected = validateBookingForPayment(booking, at);
      if (booking.paymentAttempts?.some((attempt) => attempt.status === "SUCCEEDED")) {
        throw conflict("Payment has already succeeded for this booking.");
      }
      assertAttemptCapacity(booking.paymentAttempts || []);
      return { expected };
    });
    if (preflight.existing) return preflight.existing;

    if (!paymentProvider || typeof paymentProvider.createPayment !== "function") throw unavailable();

    // This workflow intentionally supports only the local simulated provider.
    // No real Razorpay provider or remote-intent idempotency contract exists.
    let providerIntent;
    try {
      providerIntent = await paymentProvider.createPayment({
        amount: preflight.expected.amount,
        currency: preflight.expected.currency,
        expiresAt: preflight.expected.expiresAt,
      });
    } catch {
      throw unavailable();
    }
    if (!validProviderIntent(providerIntent, preflight.expected)) throw unavailable();

    try {
      return await runSerializableWithRetry(database, async (tx) => {
        const booking = await lockOwnedBooking(tx, bookingId, customerId);
        const at = now();
        const existing = chooseExistingAttempt(booking, idempotencyKey, at);
        if (existing) return serializeAttempt(existing, { reused: true });

        const expected = validateBookingForPayment(booking, at);
        if (expected.amount !== preflight.expected.amount || expected.currency !== preflight.expected.currency
          || expected.expiresAt.getTime() !== preflight.expected.expiresAt.getTime()) {
          throw conflict("The booking payment terms changed. Retry with the same idempotency key.");
        }
        if (booking.paymentAttempts?.some((attempt) => attempt.status === "SUCCEEDED")) {
          throw conflict("Payment has already succeeded for this booking.");
        }
        const attempts = booking.paymentAttempts || [];
        assertAttemptCapacity(attempts);

        const attemptNumber = attempts.length + 1;
        const attempt = await tx.experiencePaymentAttempt.create({
          data: {
            experienceBookingId: booking.id,
            attemptNumber,
            idempotencyKey,
            reference: providerIntent.reference,
            provider: "SIMULATED",
            amount: expected.amount,
            currency: expected.currency,
            status: "PENDING",
            verificationMode: null,
            expiresAt: expected.expiresAt,
            events: {
              create: {
                provider: "SIMULATED",
                fromStatus: null,
                toStatus: "PENDING",
                verificationMode: null,
                reasonCode: "INITIATED",
              },
            },
          },
        });
        return serializeAttempt(attempt);
      });
    } catch (error) {
      if (error?.code === "P2002" || isRetryableDineTransactionError(error)) {
        const booking = await database.experienceBooking.findFirst({
          where: { id: bookingId, customerId },
          include: paymentAttemptInclude,
        });
        if (!booking) throw notFound();
        const at = now();
        const existing = chooseExistingAttempt(booking, idempotencyKey, at);
        if (existing) return serializeAttempt(existing, { reused: true });
        if (isRetryableDineTransactionError(error)) {
          throw conflict("Payment initiation changed concurrently. Retry with the same idempotency key.");
        }
      }
      throw error;
    }
  },

  async confirmPayment(customerId, bookingId, attemptId, mockOutcome) {
    if (!customerId) throw new AppError("Customer account access is required.", HTTP_STATUS.FORBIDDEN);
    if (!allowMockPayments) throw unavailable();
    const outcomeChoice = typeof mockOutcome === "string" ? mockOutcome.toLowerCase() : mockOutcome;
    if (outcomeChoice !== "success" && outcomeChoice !== "failure") {
      throw new AppError("Choose the demo success or failure outcome for this simulated payment.", HTTP_STATUS.BAD_REQUEST);
    }
    if (!paymentProvider || typeof paymentProvider.confirmPayment !== "function") throw unavailable();

    const loadAttempt = (booking) => booking.paymentAttempts?.find((item) => item.id === attemptId) || null;
    const expirePaymentWindow = async (tx, booking, at) => {
      if (booking.status !== "ACCEPTED" || !booking.slotId || !(booking.paymentExpiresAt instanceof Date)
        || booking.paymentExpiresAt > at) return false;
      await expireDueBookingsForSlot(tx, booking.slotId, at, notificationServiceFactory);
      return true;
    };

    // Check ownership, terminal state, and the fixed deadline before asking
    // the simulated provider to resolve the demo choice.
    const preflight = await runSerializableWithRetry(database, async (tx) => {
      const booking = await lockOwnedBooking(tx, bookingId, customerId);
      const attempt = loadAttempt(booking);
      if (!attempt) throw notFound();
      if (attempt.provider !== "SIMULATED") throw conflict("This payment attempt is not eligible for mock confirmation.");
      if (attempt.status === "SUCCEEDED") {
        if (booking.status !== "CONFIRMED") throw conflict("The successful payment and booking state require review.");
        return { result: serializeConfirmation(booking, attempt, { reused: true }) };
      }
      const at = now();
      if (await expirePaymentWindow(tx, booking, at)) return { expired: true };
      if (attempt.status === "FAILED") return { result: serializeConfirmation(booking, attempt, { reused: true }) };
      if (attempt.status === "EXPIRED") throw conflict("This payment attempt has expired.");
      if (booking.status !== "ACCEPTED" || !booking.acceptedAt || !booking.paymentExpiresAt
        || booking.cancellationStatus === "PENDING"
        || attempt.expiresAt.getTime() !== booking.paymentExpiresAt.getTime()
        || booking.paymentExpiresAt <= at) {
        throw conflict("This booking is no longer eligible for payment confirmation.");
      }
      return { reference: attempt.reference };
    });
    if (preflight.expired) throw conflict("The payment window expired; the booking and held seats have been released.");
    if (preflight.result) return preflight.result;

    let providerResult;
    try {
      providerResult = await paymentProvider.confirmPayment({
        reference: preflight.reference,
        mockOutcome: outcomeChoice === "success" ? "SUCCESS" : "FAILURE",
      });
    } catch {
      throw unavailable();
    }
    if (!validProviderResult(providerResult, preflight.reference)) throw unavailable();

    const outcome = await runSerializableWithRetry(database, async (tx) => {
      const booking = await lockOwnedBooking(tx, bookingId, customerId);
      const attempt = loadAttempt(booking);
      if (!attempt) throw notFound();
      if (attempt.provider !== "SIMULATED") throw conflict("This payment attempt is not eligible for mock confirmation.");
      if (attempt.status === "SUCCEEDED") {
        if (booking.status !== "CONFIRMED") throw conflict("The successful payment and booking state require review.");
        return { result: serializeConfirmation(booking, attempt, { reused: true }) };
      }
      const at = now();
      if (await expirePaymentWindow(tx, booking, at)) return { expired: true };
      if (attempt.status === "FAILED") return { result: serializeConfirmation(booking, attempt, { reused: true }) };
      if (attempt.status === "EXPIRED") return { expired: true };
      if (booking.status !== "ACCEPTED" || !booking.acceptedAt || !booking.paymentExpiresAt
        || booking.cancellationStatus === "PENDING"
        || attempt.expiresAt.getTime() !== booking.paymentExpiresAt.getTime()
        || attempt.expiresAt <= at || booking.paymentExpiresAt <= at) {
        throw conflict("This booking is no longer eligible for payment confirmation.");
      }
      const expected = validateBookingForPayment(booking, at);
      if (normalizeCurrency(attempt.amount) !== expected.amount || attempt.currency !== expected.currency) {
        throw conflict("The payment attempt does not match the saved booking amount and currency.");
      }

      if (providerResult.status === "FAILED") {
        const changed = await tx.experiencePaymentAttempt.updateMany({
          where: { id: attempt.id, experienceBookingId: booking.id, status: "PENDING", expiresAt: { gt: at } },
          data: { status: "FAILED" },
        });
        if (changed.count !== 1) throw conflict("The payment attempt changed while confirmation was processing.");
        await tx.experiencePaymentEvent.create({
          data: {
            paymentAttemptId: attempt.id,
            provider: "SIMULATED",
            providerEventKey: `dine-mock:${attempt.id}:failed`,
            fromStatus: "PENDING",
            toStatus: "FAILED",
            verificationMode: "SIMULATED",
            reasonCode: "DEMO_PAYMENT_FAILURE",
          },
        });
        return { result: serializeConfirmation(booking, { ...attempt, status: "FAILED" }) };
      }

      if (!booking.slotId || !booking.numberOfGuests || !booking.slot
        || !["OPEN", "PAUSED"].includes(booking.slot.status)) {
        throw conflict("The booking no longer has a valid held slot.");
      }
      const held = await tx.experienceBooking.aggregate({
        where: { slotId: booking.slotId, status: { in: ACTIVE_CAPACITY_BOOKING_STATUSES } },
        _sum: { numberOfGuests: true },
      });
      const heldGuests = held._sum.numberOfGuests || 0;
      if (booking.slot.availableSeats < 0 || booking.slot.availableSeats + heldGuests !== booking.slot.capacity) {
        throw conflict("The slot capacity no longer matches its persisted seat holds.");
      }

      const attemptChanged = await tx.experiencePaymentAttempt.updateMany({
        where: { id: attempt.id, experienceBookingId: booking.id, status: "PENDING", expiresAt: { gt: at } },
        data: { status: "SUCCEEDED", verificationMode: "SIMULATED", succeededAt: at },
      });
      if (attemptChanged.count !== 1) throw conflict("The payment attempt changed while confirmation was processing.");
      const bookingChanged = await tx.experienceBooking.updateMany({
        where: { id: booking.id, customerId, status: "ACCEPTED", paymentExpiresAt: { gt: at } },
        data: { status: "CONFIRMED" },
      });
      if (bookingChanged.count !== 1) throw conflict("The booking changed while payment confirmation was processing.");
      await tx.experiencePaymentEvent.create({
        data: {
          paymentAttemptId: attempt.id,
          provider: "SIMULATED",
          providerEventKey: `dine-mock:${attempt.id}:succeeded`,
          fromStatus: "PENDING",
          toStatus: "SUCCEEDED",
          verificationMode: "SIMULATED",
          reasonCode: "DEMO_PAYMENT_SUCCESS",
        },
      });
      await notifyCookPaymentConfirmed(tx, notificationServiceFactory, booking);
      return {
        result: serializeConfirmation(
          { ...booking, status: "CONFIRMED" },
          { ...attempt, status: "SUCCEEDED", verificationMode: "SIMULATED", succeededAt: at },
        ),
      };
    });
    if (outcome.expired) throw conflict("The payment window expired; the booking and held seats have been released.");
    return outcome.result;
  },
});
