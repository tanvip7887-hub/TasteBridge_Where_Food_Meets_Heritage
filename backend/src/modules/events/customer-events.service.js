import { currencyNumber, normalizeCurrency } from "../../utils/money.js";

const DEFAULT_CANCELLATION_WINDOW_HOURS = 48;

const cancellationSummary = (booking, cancellationWindowHours, now) => {
  const allowedStatus = ["PENDING", "ACCEPTED", "CONFIRMED"].includes(booking.status);
  let deadlineAt = null;
  // Slot.start is the authoritative scheduled instant for Dine cancellation.
  // Do not make a booking look cancellable using a stale/legacy bookingDate
  // when its actual slot time is unavailable.
  const slotStartsAt = booking.slot?.startsAt instanceof Date ? booking.slot.startsAt : null;
  if (booking.status === "PENDING") deadlineAt = booking.holdExpiresAt;
  else if (booking.status === "ACCEPTED") deadlineAt = booking.paymentExpiresAt;
  else if (booking.status === "CONFIRMED" && slotStartsAt && Number.isFinite(slotStartsAt.getTime())
    && Number.isInteger(cancellationWindowHours) && cancellationWindowHours >= 0 && cancellationWindowHours <= 720) {
    deadlineAt = new Date(slotStartsAt.getTime() - cancellationWindowHours * 60 * 60 * 1000);
  }

  const validDeadline = deadlineAt instanceof Date && Number.isFinite(deadlineAt.getTime());
  const succeeded = (booking.paymentAttempts || []).filter((attempt) => attempt.status === "SUCCEEDED");
  let confirmedPayment = booking.status !== "CONFIRMED";
  if (booking.status === "CONFIRMED" && succeeded.length === 1) {
    const [attempt] = succeeded;
    try {
      const expectedAmount = booking.totalAmountSnapshot ?? booking.totalAmount;
      confirmedPayment = attempt.provider === "SIMULATED"
        && attempt.verificationMode === "SIMULATED"
        && attempt.currency === "INR"
        && normalizeCurrency(attempt.amount) === normalizeCurrency(expectedAmount);
    } catch {
      confirmedPayment = false;
    }
  }
  const slotCanRelease = Boolean(booking.slot?.id && ["OPEN", "PAUSED"].includes(booking.slot.status));
  const isAwaitingReview = booking.cancellationStatus === "PENDING";
  const withinDeadline = validDeadline
    && (booking.status === "CONFIRMED" ? now.getTime() <= deadlineAt.getTime() : now.getTime() < deadlineAt.getTime());
  const eligible = allowedStatus && slotCanRelease && validDeadline && confirmedPayment && !isAwaitingReview && withinDeadline;
  let reason = null;
  if (!allowedStatus) reason = "This booking cannot be cancelled in its current state.";
  else if (isAwaitingReview) reason = "Cancellation request is awaiting Cook review.";
  else if (!slotCanRelease) reason = "The reserved slot is no longer available for cancellation.";
  else if (!validDeadline) reason = "Cancellation eligibility could not be verified. Refresh your bookings.";
  else if (!confirmedPayment) reason = "A verified successful payment is required to cancel this confirmed booking.";
  else if (!withinDeadline && booking.status === "CONFIRMED") {
    reason = `The cancellation window has closed. Requests must be made at least ${cancellationWindowHours} hours before the experience starts.`;
  } else if (!withinDeadline && booking.status === "PENDING") reason = "The booking hold has expired.";
  else if (!withinDeadline && booking.status === "ACCEPTED") reason = "The payment deadline has expired.";

  return {
    eligible,
    deadlineAt: validDeadline ? deadlineAt : null,
    status: booking.cancellationStatus || null,
    reason,
  };
};

/** Customer-owned experience bookings; Experience is the shared persisted model for event bookings. */
export const createCustomerEventsService = (database, { now = () => new Date() } = {}) => ({
  async listMyBookings(customerId, experienceType = null) {
    const [bookings, settings] = await Promise.all([database.experienceBooking.findMany({
      where: { customerId, ...(experienceType ? { experience: { type: experienceType } } : {}) },
      orderBy: [{ bookingDate: "asc" }, { id: "asc" }],
      select: {
        id: true,
        experienceId: true,
        bookingDate: true,
        numberOfGuests: true,
        totalAmount: true,
        totalAmountSnapshot: true,
        status: true,
        cancellationRequestedAt: true,
        cancellationReason: true,
        cancellationStatus: true,
        cancellationDecisionReason: true,
        cancellationDecidedAt: true,
        holdExpiresAt: true,
        paymentExpiresAt: true,
        createdAt: true,
        paymentAttempts: {
          orderBy: [{ attemptNumber: "asc" }, { id: "asc" }],
          select: {
            id: true, attemptNumber: true, status: true, expiresAt: true, createdAt: true,
            provider: true, verificationMode: true, amount: true, currency: true,
            refund: { select: { id: true, status: true, provider: true, verificationMode: true, amount: true, currency: true, attemptCount: true, succeededAt: true } },
          },
        },
        experience: { select: { title: true, location: true, type: true } },
        slot: { select: { id: true, startsAt: true, status: true, availableSeats: true, capacity: true } },
      },
    }), database.platformSettings?.findUnique
      ? database.platformSettings.findUnique({ where: { id: "default" } })
      : null]);

    const cancellationWindowHours = settings?.experienceCancellationWindowHours ?? DEFAULT_CANCELLATION_WINDOW_HOURS;
    const at = now();

    return {
      serverTime: at,
      items: bookings.map((booking) => ({
        id: booking.id,
        referenceId: booking.id,
        experienceId: booking.experienceId,
        eventType: booking.experience.type,
        title: booking.experience.title,
        bookingDate: booking.bookingDate,
        venue: booking.experience.location,
        status: booking.status,
        cancellationRequestedAt: booking.cancellationRequestedAt,
        cancellationReason: booking.cancellationReason,
        cancellationStatus: booking.cancellationStatus,
        cancellationDecisionReason: booking.cancellationDecisionReason,
        cancellationDecidedAt: booking.cancellationDecidedAt,
        holdExpiresAt: booking.holdExpiresAt,
        paymentExpiresAt: booking.paymentExpiresAt,
        availableSeats: booking.slot?.availableSeats ?? null,
        cancellation: cancellationSummary(booking, cancellationWindowHours, at),
        paymentAttempts: (booking.paymentAttempts || []).map(({ id, attemptNumber, status, expiresAt, createdAt }) => ({
          id, attemptNumber, status, expiresAt, createdAt,
        })),
        refund: (() => {
          const refund = (booking.paymentAttempts || []).find((attempt) => attempt.refund)?.refund;
          return refund ? {
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
          } : null;
        })(),
        numberOfGuests: booking.numberOfGuests,
        totalAmount: booking.totalAmount,
        createdAt: booking.createdAt,
      })),
    };
  },
});
