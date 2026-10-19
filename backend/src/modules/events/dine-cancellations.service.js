import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { currencyNumber, normalizeCurrency } from "../../utils/money.js";
import { createNotificationsService } from "../notifications/notifications.service.js";
import {
  expireDueBookingsForSlot,
  isRetryableDineTransactionError,
  releaseDineBookingSeats,
  runSerializableWithRetry,
} from "./dine-booking-expiry.service.js";

const DEFAULT_CANCELLATION_WINDOW_HOURS = 48;
const ACTIVE_CAPACITY_BOOKING_STATUSES = ["PENDING", "ACCEPTED", "CONFIRMED"];
const notFound = (message = "Experience booking not found.") => new AppError(message, HTTP_STATUS.NOT_FOUND);
const conflict = (message) => new AppError(message, HTTP_STATUS.CONFLICT);
const badRequest = (message) => new AppError(message, HTTP_STATUS.BAD_REQUEST);

const cancellationInclude = {
  experience: { select: { id: true, cookId: true, type: true, title: true, cook: { select: { userId: true } } } },
  slot: { select: { id: true, startsAt: true, capacity: true, availableSeats: true, status: true } },
  paymentAttempts: {
    orderBy: [{ attemptNumber: "asc" }, { id: "asc" }],
    include: { refund: true },
  },
};

const serializeRefund = (refund) => refund ? ({
  id: refund.id,
  status: refund.status,
  provider: refund.provider,
  verificationMode: refund.verificationMode,
  amount: currencyNumber(refund.amount),
  currency: refund.currency,
  attemptCount: refund.attemptCount,
  succeededAt: refund.succeededAt,
  simulated: refund.provider === "SIMULATED",
  realMoneyReturned: false,
}) : null;

const serializeBooking = (booking, refund = null) => ({
  booking: {
    id: booking.id,
    experienceId: booking.experienceId,
    slotId: booking.slotId,
    bookingDate: booking.bookingDate,
    numberOfGuests: booking.numberOfGuests,
    status: booking.status,
    cancellationRequestedAt: booking.cancellationRequestedAt ?? null,
    cancellationReason: booking.cancellationReason ?? null,
    cancellationStatus: booking.cancellationStatus ?? null,
    cancellationDecisionReason: booking.cancellationDecisionReason ?? null,
    cancellationDecidedAt: booking.cancellationDecidedAt ?? null,
    totalAmount: booking.totalAmountSnapshot === null || booking.totalAmountSnapshot === undefined
      ? booking.totalAmount : currencyNumber(booking.totalAmountSnapshot),
    updatedAt: booking.updatedAt,
  },
  refund: serializeRefund(refund),
  simulated: Boolean(refund),
  realMoneyReturned: false,
});

const loadOwnedBooking = (tx, bookingId, customerId) => tx.experienceBooking.findFirst({
  where: { id: bookingId, customerId },
  include: cancellationInclude,
});

const lockOwnedBooking = async (tx, bookingId, customerId) => {
  const rows = await tx.$queryRaw`
    SELECT "id" FROM "ExperienceBooking"
    WHERE "id" = ${bookingId} AND "customerId" = ${customerId}
    FOR UPDATE
  `;
  if (rows.length !== 1) throw notFound();
  const booking = await loadOwnedBooking(tx, bookingId, customerId);
  if (!booking) throw notFound();
  return booking;
};

const lockCookBooking = async (tx, bookingId, cookId) => {
  const rows = await tx.$queryRaw`
    SELECT b."id" FROM "ExperienceBooking" b
    JOIN "Experience" e ON e."id" = b."experienceId"
    WHERE b."id" = ${bookingId} AND e."cookId" = ${cookId}
    FOR UPDATE
  `;
  if (rows.length !== 1) throw notFound("Booking not found for this Cook.");
  const booking = await tx.experienceBooking.findFirst({
    where: { id: bookingId, experience: { cookId } },
    include: cancellationInclude,
  });
  if (!booking) throw notFound("Booking not found for this Cook.");
  return booking;
};

const configuredCancellationWindow = async (tx) => {
  const settings = await tx.platformSettings.findUnique({ where: { id: "default" } });
  const value = settings?.experienceCancellationWindowHours ?? DEFAULT_CANCELLATION_WINDOW_HOURS;
  if (!Number.isInteger(value) || value < 0 || value > 720) {
    throw conflict("The configured Dine cancellation window is invalid. Contact support.");
  }
  return value;
};

const notifyCook = (tx, notificationServiceFactory, booking) => notificationServiceFactory(tx).create({
  userId: booking.experience.cook.userId,
  portal: "COOK",
  type: "ORDER_ALERT",
  title: "A Dine booking was cancelled",
  message: `The customer cancelled their booking for ${booking.experience.title}. The seats have been released${booking.status === "CONFIRMED" ? " and a simulated refund was recorded" : ""}.`,
  metadata: {
    kind: "EXPERIENCE_BOOKING_CANCELLED",
    bookingId: booking.id,
    experienceId: booking.experienceId,
    href: booking.experience.type === "WORKSHOP" ? "/cook/workshop-bookings" : "/cook/dine-bookings",
  },
  eventKey: `experience-booking:${booking.id}:customer-cancelled:cook:${booking.experience.cook.userId}`,
});

const expirePendingAttempts = async (tx, booking, at) => {
  const pending = booking.paymentAttempts.filter((attempt) => attempt.status === "PENDING");
  if (!pending.length) return;
  const changed = await tx.experiencePaymentAttempt.updateMany({
    where: { experienceBookingId: booking.id, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
  if (changed.count !== pending.length) throw conflict("A payment attempt changed while the booking was being cancelled. Retry the request.");
  for (const attempt of pending) {
    await tx.experiencePaymentEvent.create({
      data: {
        paymentAttemptId: attempt.id,
        provider: attempt.provider,
        providerEventKey: `dine-payment:${attempt.id}:booking-cancelled`,
        fromStatus: "PENDING",
        toStatus: "EXPIRED",
        verificationMode: null,
        reasonCode: "BOOKING_CANCELLED",
      },
    });
  }
};

const createSimulatedRefund = async (tx, booking, at) => {
  const succeeded = booking.paymentAttempts.filter((attempt) => attempt.status === "SUCCEEDED");
  if (succeeded.length !== 1) throw conflict("A successful payment record is required before a refund can be recorded.");
  const [attempt] = succeeded;
  if (attempt.provider !== "SIMULATED" || attempt.verificationMode !== "SIMULATED") {
    throw conflict("This booking is not eligible for a simulated refund.");
  }
  let paidAmount;
  let bookingAmount;
  try {
    paidAmount = normalizeCurrency(attempt.amount);
    bookingAmount = normalizeCurrency(booking.totalAmountSnapshot);
  } catch {
    throw conflict("The saved payment amount cannot be verified for a refund.");
  }
  if (paidAmount !== bookingAmount || attempt.currency !== "INR") {
    throw conflict("The successful payment does not match the saved booking amount and currency.");
  }
  if (attempt.refund) throw conflict("A refund record already exists for this payment attempt; review the booking before retrying.");

  return tx.experienceRefund.create({
    data: {
      paymentAttemptId: attempt.id,
      idempotencyKey: `experience-booking:${booking.id}:customer-cancellation:refund`,
      provider: "SIMULATED",
      amount: paidAmount,
      currency: attempt.currency,
      status: "SUCCEEDED",
      verificationMode: "SIMULATED",
      attemptCount: 1,
      lastAttemptAt: at,
      succeededAt: at,
    },
  });
};

export const createDineCancellationsService = (
  database,
  { now = () => new Date(), notificationServiceFactory = createNotificationsService } = {},
) => ({
  /**
   * Customer submits a required cancellation reason.
   * The booking remains CONFIRMED and seats stay held while awaiting Cook review.
   */
  async requestCancellation(customerId, bookingId, rawReason) {
    if (!customerId) throw new AppError("Customer account access is required.", HTTP_STATUS.FORBIDDEN);
    const reason = typeof rawReason === "string" ? rawReason.trim() : "";
    if (!reason || reason.length < 5 || reason.length > 500) {
      throw badRequest("A cancellation reason between 5 and 500 characters is required.");
    }

    try {
      const outcome = await runSerializableWithRetry(database, async (tx) => {
        const booking = await lockOwnedBooking(tx, bookingId, customerId);

        // Idempotent retry: if already requested and pending review, return current state
        if (booking.cancellationStatus === "PENDING") {
          return { result: serializeBooking(booking) };
        }

        if (booking.status === "CANCELLED") {
          const refund = booking.paymentAttempts.find((attempt) => attempt.refund)?.refund || null;
          return { result: serializeBooking(booking, refund) };
        }
        if (["COMPLETED", "REJECTED", "EXPIRED"].includes(booking.status)) {
          throw conflict(`A ${booking.status.toLowerCase()} booking cannot be cancelled.`);
        }
        if (!["PENDING", "ACCEPTED", "CONFIRMED"].includes(booking.status)) {
          throw conflict("This booking cannot be cancelled in its current state.");
        }

        const at = now();
        if (booking.status === "PENDING" && (!booking.holdExpiresAt || booking.holdExpiresAt <= at)) {
          if (!booking.slotId) throw conflict("The expired booking has no slot to release.");
          await expireDueBookingsForSlot(tx, booking.slotId, at, notificationServiceFactory);
          return { expired: true };
        }
        if (booking.status === "ACCEPTED" && (!booking.paymentExpiresAt || booking.paymentExpiresAt <= at)) {
          if (!booking.slotId) throw conflict("The expired booking has no slot to release.");
          await expireDueBookingsForSlot(tx, booking.slotId, at, notificationServiceFactory);
          return { expired: true };
        }
        if (!booking.slotId || !booking.slot || !["OPEN", "PAUSED"].includes(booking.slot.status)) {
          throw conflict("The booking no longer has a releasable seat hold.");
        }

        if (booking.status === "CONFIRMED") {
          if (!(booking.slot.startsAt instanceof Date) || !Number.isFinite(booking.slot.startsAt.getTime())) {
            throw conflict("The scheduled experience time is unavailable, so cancellation eligibility cannot be verified.");
          }
          const windowHours = await configuredCancellationWindow(tx);
          const deadline = booking.slot.startsAt.getTime() - windowHours * 60 * 60 * 1000;
          if (at.getTime() > deadline) {
            throw conflict(`Confirmed bookings can be cancelled only at least ${windowHours} hours before the experience starts.`);
          }
        }

        const changed = await tx.experienceBooking.updateMany({
          where: { id: booking.id, customerId, status: booking.status },
          data: {
            cancellationStatus: "PENDING",
            cancellationReason: reason,
            cancellationRequestedAt: at,
          },
        });
        if (changed.count !== 1) throw conflict("The booking changed while submitting cancellation request. Refresh and retry.");

        // Notify Cook of the cancellation request with customer reason
        await notificationServiceFactory(tx).create({
          userId: booking.experience.cook.userId,
          portal: "COOK",
          type: "ORDER_ALERT",
          title: "Cancellation requested",
          message: `The customer requested cancellation for ${booking.experience.title}. Reason: “${reason}”. Please review this request in your bookings panel.`,
          metadata: {
            kind: "EXPERIENCE_BOOKING_CANCELLATION_REQUESTED",
            bookingId: booking.id,
            experienceId: booking.experienceId,
            href: booking.experience.type === "WORKSHOP" ? "/cook/workshop-bookings" : "/cook/dine-bookings",
          },
          eventKey: `experience-booking:${booking.id}:cancellation-requested:cook:${booking.experience.cook.userId}`,
        });

        const persisted = await loadOwnedBooking(tx, booking.id, customerId);
        return { result: serializeBooking(persisted) };
      });

      if (outcome.expired) throw conflict("The booking had expired; its seats were released and it cannot be cancelled.");
      return outcome.result;
    } catch (error) {
      if (isRetryableDineTransactionError(error)) {
        throw conflict("The booking changed concurrently. Refresh and retry cancellation request.");
      }
      throw error;
    }
  },

  /**
   * Cook approves a customer cancellation request.
   * Cancels the booking, restores seats exactly once, records exact simulated refund if paid,
   * and notifies the customer.
   */
  async approveCancellation(cookId, bookingId) {
    if (!cookId) throw new AppError("An approved Cook account is required.", HTTP_STATUS.FORBIDDEN);

    try {
      const outcome = await runSerializableWithRetry(database, async (tx) => {
        const booking = await lockCookBooking(tx, bookingId, cookId);

        // Idempotency: if already cancelled and approved, return current record without duplicate actions
        if (booking.status === "CANCELLED" && booking.cancellationStatus === "APPROVED") {
          const refund = booking.paymentAttempts.find((attempt) => attempt.refund)?.refund || null;
          return { result: serializeBooking(booking, refund) };
        }

        if (booking.status === "CANCELLED") {
          throw conflict("This booking is already cancelled.");
        }
        if (booking.cancellationStatus !== "PENDING") {
          throw conflict("Only bookings with a pending cancellation request can be approved.");
        }
        if (["COMPLETED", "REJECTED", "EXPIRED"].includes(booking.status)) {
          throw conflict(`A ${booking.status.toLowerCase()} booking cannot be cancelled.`);
        }
        if (!["PENDING", "ACCEPTED", "CONFIRMED"].includes(booking.status)) {
          throw conflict("This booking cannot be cancelled in its current state.");
        }
        if (!booking.slotId || !booking.slot || !["OPEN", "PAUSED"].includes(booking.slot.status)) {
          throw conflict("The booking no longer has a releasable seat hold.");
        }

        const at = now();
        let refund = null;
        if (booking.status === "CONFIRMED") {
          refund = await createSimulatedRefund(tx, booking, at);
        } else if (booking.paymentAttempts.some((attempt) => attempt.status === "SUCCEEDED")) {
          throw conflict("The payment record conflicts with this unpaid booking state. Contact support.");
        }

        const held = await tx.experienceBooking.aggregate({
          where: { slotId: booking.slotId, status: { in: ACTIVE_CAPACITY_BOOKING_STATUSES } },
          _sum: { numberOfGuests: true },
        });
        const heldGuests = held._sum.numberOfGuests || 0;
        if (booking.slot.availableSeats < 0 || booking.slot.availableSeats + heldGuests !== booking.slot.capacity) {
          throw conflict("The slot capacity no longer matches its persisted seat holds.");
        }

        const changed = await tx.experienceBooking.updateMany({
          where: { id: booking.id, experience: { cookId }, status: booking.status, cancellationStatus: "PENDING" },
          data: {
            status: "CANCELLED",
            cancellationStatus: "APPROVED",
            cancellationDecidedAt: at,
          },
        });
        if (changed.count !== 1) throw conflict("The booking changed while approving cancellation. Refresh and retry.");

        await expirePendingAttempts(tx, booking, at);
        await releaseDineBookingSeats(tx, booking.slotId, booking.numberOfGuests);

        // Notify customer of cancellation approval and refund amount/status
        const refundNotice = refund
          ? ` A simulated refund of ₹${currencyNumber(refund.amount)} was recorded.`
          : " No refund was due for this unpaid booking.";
        await notificationServiceFactory(tx).create({
          userId: booking.customerId,
          portal: "CUSTOMER",
          type: "ORDER_ALERT",
          title: "Cancellation approved",
          message: `The Cook approved your cancellation for ${booking.experience.title}.${refundNotice}`,
          metadata: {
            kind: "EXPERIENCE_BOOKING_CANCELLED",
            bookingId: booking.id,
            experienceId: booking.experienceId,
            href: "/my-events",
          },
          eventKey: `experience-booking:${booking.id}:cancellation-approved:customer:${booking.customerId}`,
        });

        const persisted = await tx.experienceBooking.findFirst({
          where: { id: booking.id, experience: { cookId } },
          include: cancellationInclude,
        });
        const persistedRefund = refund
          ? await tx.experienceRefund.findUnique({ where: { paymentAttemptId: refund.paymentAttemptId } })
          : null;
        return { result: serializeBooking(persisted, persistedRefund) };
      });

      return outcome.result;
    } catch (error) {
      if (isRetryableDineTransactionError(error)) {
        throw conflict("The booking changed concurrently. Refresh and retry approval.");
      }
      throw error;
    }
  },

  /**
   * Cook rejects a customer cancellation request.
   * Keeps the booking active (CONFIRMED), records the decision and optional reason,
   * does not restore seats or create a refund, and notifies the customer.
   */
  async rejectCancellation(cookId, bookingId, rawRejectionReason) {
    if (!cookId) throw new AppError("An approved Cook account is required.", HTTP_STATUS.FORBIDDEN);
    const rejectionReason = typeof rawRejectionReason === "string" ? rawRejectionReason.trim() : "";
    if (rejectionReason.length > 500) {
      throw badRequest("Rejection reason cannot exceed 500 characters.");
    }

    try {
      const outcome = await runSerializableWithRetry(database, async (tx) => {
        const booking = await lockCookBooking(tx, bookingId, cookId);

        // Idempotency: if already rejected, return current state
        if (booking.cancellationStatus === "REJECTED") {
          return { result: serializeBooking(booking) };
        }

        if (booking.status === "CANCELLED") {
          throw conflict("Cancelled bookings cannot be rejected.");
        }
        if (booking.cancellationStatus !== "PENDING") {
          throw conflict("Only bookings with a pending cancellation request can be rejected.");
        }

        const at = now();
        if (booking.status === "PENDING" && (!booking.holdExpiresAt || booking.holdExpiresAt <= at)) {
          if (!booking.slotId) throw conflict("The expired booking has no slot to release.");
          await expireDueBookingsForSlot(tx, booking.slotId, at, notificationServiceFactory);
          return { expired: true };
        }
        if (booking.status === "ACCEPTED" && (!booking.paymentExpiresAt || booking.paymentExpiresAt <= at)) {
          if (!booking.slotId) throw conflict("The expired booking has no slot to release.");
          await expireDueBookingsForSlot(tx, booking.slotId, at, notificationServiceFactory);
          return { expired: true };
        }
        if (!["PENDING", "ACCEPTED", "CONFIRMED"].includes(booking.status)) {
          throw conflict("Only an active booking can have a cancellation request rejected.");
        }
        const changed = await tx.experienceBooking.updateMany({
          where: { id: booking.id, experience: { cookId }, cancellationStatus: "PENDING" },
          data: {
            cancellationStatus: "REJECTED",
            cancellationDecisionReason: rejectionReason || null,
            cancellationDecidedAt: at,
          },
        });
        if (changed.count !== 1) throw conflict("The booking changed while rejecting cancellation. Refresh and retry.");

        // Booking remains active (e.g. CONFIRMED). Seats remain held.
        // Notify customer with Cook decision and rejection reason if provided.
        const reasonDetail = rejectionReason ? ` Reason: “${rejectionReason}”.` : "";
        const reservationStatus = booking.status === "CONFIRMED"
          ? "Your reservation remains confirmed."
          : `Your reservation remains ${booking.status.toLowerCase()}.`;
        await notificationServiceFactory(tx).create({
          userId: booking.customerId,
          portal: "CUSTOMER",
          type: "ORDER_ALERT",
          title: "Cancellation request declined",
          message: `The Cook declined your cancellation request for ${booking.experience.title}.${reasonDetail} ${reservationStatus}`,
          metadata: {
            kind: "EXPERIENCE_CANCELLATION_REJECTED",
            bookingId: booking.id,
            experienceId: booking.experienceId,
            href: "/my-events",
          },
          eventKey: `experience-booking:${booking.id}:cancellation-rejected:customer:${booking.customerId}`,
        });

        const persisted = await tx.experienceBooking.findFirst({
          where: { id: booking.id, experience: { cookId } },
          include: cancellationInclude,
        });
        return { result: serializeBooking(persisted) };
      });

      if (outcome.expired) throw conflict("The booking expired while the cancellation request was awaiting review.");
      return outcome.result;
    } catch (error) {
      if (isRetryableDineTransactionError(error)) {
        throw conflict("The booking changed concurrently. Refresh and retry rejection.");
      }
      throw error;
    }
  },

  /**
   * Direct cancel (preserved for programmatic/admin cancellation or legacy test suite).
   */
  async cancelBooking(customerId, bookingId) {
    if (!customerId) throw new AppError("Customer account access is required.", HTTP_STATUS.FORBIDDEN);

    try {
      const outcome = await runSerializableWithRetry(database, async (tx) => {
        const booking = await lockOwnedBooking(tx, bookingId, customerId);
        if (booking.status === "CANCELLED") {
          const refund = booking.paymentAttempts.find((attempt) => attempt.refund)?.refund || null;
          return { result: serializeBooking(booking, refund) };
        }
        if (["COMPLETED", "REJECTED", "EXPIRED"].includes(booking.status)) {
          throw conflict(`A ${booking.status.toLowerCase()} booking cannot be cancelled.`);
        }
        if (!["PENDING", "ACCEPTED", "CONFIRMED"].includes(booking.status)) {
          throw conflict("This booking cannot be cancelled in its current state.");
        }

        const at = now();
        if (booking.status === "PENDING" && (!booking.holdExpiresAt || booking.holdExpiresAt <= at)) {
          if (!booking.slotId) throw conflict("The expired booking has no slot to release.");
          await expireDueBookingsForSlot(tx, booking.slotId, at, notificationServiceFactory);
          return { expired: true };
        }
        if (booking.status === "ACCEPTED" && (!booking.paymentExpiresAt || booking.paymentExpiresAt <= at)) {
          if (!booking.slotId) throw conflict("The expired booking has no slot to release.");
          await expireDueBookingsForSlot(tx, booking.slotId, at, notificationServiceFactory);
          return { expired: true };
        }
        if (!booking.slotId || !booking.slot || !["OPEN", "PAUSED"].includes(booking.slot.status)) {
          throw conflict("The booking no longer has a releasable seat hold.");
        }

        let refund = null;
        if (booking.status === "CONFIRMED") {
          if (!(booking.slot.startsAt instanceof Date) || !Number.isFinite(booking.slot.startsAt.getTime())) {
            throw conflict("The scheduled experience time is unavailable, so cancellation eligibility cannot be verified.");
          }
          const windowHours = await configuredCancellationWindow(tx);
          const deadline = booking.slot.startsAt.getTime() - windowHours * 60 * 60 * 1000;
          if (at.getTime() > deadline) {
            throw conflict(`Confirmed bookings can be cancelled only at least ${windowHours} hours before the experience starts.`);
          }
          refund = await createSimulatedRefund(tx, booking, at);
        } else if (booking.paymentAttempts.some((attempt) => attempt.status === "SUCCEEDED")) {
          throw conflict("The payment record conflicts with this unpaid booking state. Contact support.");
        }

        const held = await tx.experienceBooking.aggregate({
          where: { slotId: booking.slotId, status: { in: ACTIVE_CAPACITY_BOOKING_STATUSES } },
          _sum: { numberOfGuests: true },
        });
        const heldGuests = held._sum.numberOfGuests || 0;
        if (booking.slot.availableSeats < 0 || booking.slot.availableSeats + heldGuests !== booking.slot.capacity) {
          throw conflict("The slot capacity no longer matches its persisted seat holds.");
        }

        const changed = await tx.experienceBooking.updateMany({
          where: { id: booking.id, customerId, status: booking.status },
          data: { status: "CANCELLED", cancellationStatus: "APPROVED", cancellationDecidedAt: at },
        });
        if (changed.count !== 1) throw conflict("The booking changed while cancellation was processing. Refresh and retry.");

        await expirePendingAttempts(tx, booking, at);
        await releaseDineBookingSeats(tx, booking.slotId, booking.numberOfGuests);
        await notifyCook(tx, notificationServiceFactory, { ...booking, status: booking.status });

        const persisted = await loadOwnedBooking(tx, booking.id, customerId);
        const persistedRefund = refund
          ? await tx.experienceRefund.findUnique({ where: { paymentAttemptId: refund.paymentAttemptId } })
          : null;
        return { result: serializeBooking(persisted, persistedRefund) };
      });

      if (outcome.expired) throw conflict("The booking had expired; its seats were released and it cannot be cancelled.");
      return outcome.result;
    } catch (error) {
      if (isRetryableDineTransactionError(error)) {
        throw conflict("The booking changed concurrently. Refresh and retry cancellation.");
      }
      throw error;
    }
  },
});
