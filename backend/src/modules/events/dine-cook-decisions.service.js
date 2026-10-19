import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { createNotificationsService } from "../notifications/notifications.service.js";
import {
  expireDueBookingsForSlot,
  isRetryableDineTransactionError,
  releaseDineBookingSeats,
  runSerializableWithRetry,
} from "./dine-booking-expiry.service.js";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DEFAULT_PAYMENT_HOLD_MINUTES = 15;
const DEFAULT_BOOKING_CUTOFF_HOURS = 6;

const forbidden = () => new AppError("An approved Cook account is required.", HTTP_STATUS.FORBIDDEN);
const notFound = () => new AppError("Booking not found for this Cook.", HTTP_STATUS.NOT_FOUND);
const conflict = (message) => new AppError(message, HTTP_STATUS.CONFLICT);

const bookingInclude = {
  experience: { select: { id: true, cookId: true, title: true } },
  slot: { select: { id: true, startsAt: true } },
};

const serialize = (booking) => ({
  id: booking.id,
  experienceId: booking.experienceId,
  slotId: booking.slotId,
  bookingDate: booking.bookingDate,
  numberOfGuests: booking.numberOfGuests,
  status: booking.status,
  holdExpiresAt: booking.holdExpiresAt,
  acceptedAt: booking.acceptedAt,
  rejectedAt: booking.rejectedAt,
  paymentExpiresAt: booking.paymentExpiresAt,
  expiredAt: booking.expiredAt,
  createdAt: booking.createdAt,
});

const settingsFor = async (tx) => ({
  experiencePaymentHoldMinutes: DEFAULT_PAYMENT_HOLD_MINUTES,
  experienceBookingCutoffHours: DEFAULT_BOOKING_CUTOFF_HOURS,
  ...((await tx.platformSettings.findUnique({ where: { id: "default" } })) || {}),
});

const notifyCustomer = (tx, notificationServiceFactory, booking, action, message) => notificationServiceFactory(tx).create({
  userId: booking.customerId,
  portal: "CUSTOMER",
  type: "ORDER_ALERT",
  title: action === "accepted" ? "Your experience request was accepted" : "Your experience request was declined",
  message,
  metadata: {
    kind: action === "accepted" ? "EXPERIENCE_BOOKING_ACCEPTED" : "EXPERIENCE_BOOKING_REJECTED",
    bookingId: booking.id,
    experienceId: booking.experienceId,
    href: "/my-events",
  },
  eventKey: `experience-booking:${booking.id}:cook-${action}:customer:${booking.customerId}`,
});

export const createDineCookDecisionsService = (
  database,
  { now = () => new Date(), notificationServiceFactory = createNotificationsService } = {},
) => {
  const decide = async ({ bookingId, cookId, decision }) => {
    if (!cookId) throw forbidden();

    const outcome = await runSerializableWithRetry(database, async (tx) => {
      const booking = await tx.experienceBooking.findFirst({
        where: { id: bookingId, experience: { cookId } },
        include: bookingInclude,
      });
      if (!booking) throw notFound();

      const targetStatus = decision === "accept" ? "ACCEPTED" : "REJECTED";
      if (booking.status === targetStatus) {
        if (decision === "accept" && (!booking.acceptedAt || !booking.paymentExpiresAt)) {
          throw conflict("The accepted booking is missing its payment deadline and requires review.");
        }
        return { booking: serialize(booking) };
      }
      if (booking.status !== "PENDING") {
        throw conflict("Only a booking awaiting Cook response can be accepted or rejected.");
      }
      if (!booking.slotId || !booking.holdExpiresAt || !booking.slot) {
        throw conflict("This booking has no active seat hold and cannot be decided.");
      }

      const at = now();
      if (booking.holdExpiresAt <= at) {
        await expireDueBookingsForSlot(tx, booking.slotId, at, notificationServiceFactory);
        return { expired: true };
      }

      if (decision === "accept") {
        const settings = await settingsFor(tx);
        const paymentExpiresAt = new Date(at.getTime() + settings.experiencePaymentHoldMinutes * MINUTE_MS);
        const latestPaymentAt = booking.slot.startsAt.getTime() - settings.experienceBookingCutoffHours * HOUR_MS;
        if (paymentExpiresAt.getTime() > latestPaymentAt) {
          throw conflict("There is not enough time to complete the payment window before the booking cutoff.");
        }

        const changed = await tx.experienceBooking.updateMany({
          where: { id: booking.id, status: "PENDING", holdExpiresAt: { gt: at }, slotId: booking.slotId },
          data: { status: "ACCEPTED", acceptedAt: at, paymentExpiresAt },
        });
        if (changed.count !== 1) {
          const current = await tx.experienceBooking.findFirst({ where: { id: booking.id, experience: { cookId } }, include: bookingInclude });
          if (current?.status === targetStatus && current.acceptedAt && current.paymentExpiresAt) return { booking: serialize(current) };
          throw conflict("The booking changed while you were deciding. Refresh and try again.");
        }

        const accepted = await tx.experienceBooking.findFirst({
          where: { id: booking.id, experience: { cookId }, status: "ACCEPTED" },
          include: bookingInclude,
        });
        if (!accepted?.acceptedAt || !accepted.paymentExpiresAt) throw conflict("The accepted booking could not be verified.");
        await notifyCustomer(
          tx,
          notificationServiceFactory,
          accepted,
          "accepted",
          `The Cook accepted ${accepted.experience.title}. Complete payment by ${accepted.paymentExpiresAt.toISOString()}.`,
        );
        return { booking: serialize(accepted) };
      }

      const changed = await tx.experienceBooking.updateMany({
        where: { id: booking.id, status: "PENDING", holdExpiresAt: { gt: at }, slotId: booking.slotId },
        data: { status: "REJECTED", rejectedAt: at },
      });
      if (changed.count !== 1) {
        const current = await tx.experienceBooking.findFirst({ where: { id: booking.id, experience: { cookId } }, include: bookingInclude });
        if (current?.status === targetStatus) return { booking: serialize(current) };
        throw conflict("The booking changed while you were deciding. Refresh and try again.");
      }

      await releaseDineBookingSeats(tx, booking.slotId, booking.numberOfGuests);
      const rejected = { ...booking, status: "REJECTED", rejectedAt: at };
      await notifyCustomer(
        tx,
        notificationServiceFactory,
        rejected,
        "rejected",
        `The Cook declined ${booking.experience.title}. The reserved seats have been released.`,
      );
      return { booking: serialize(rejected) };
    });

    if (outcome.expired) throw conflict("The Cook response window has expired; the booking was expired and its seats released.");
    return outcome.booking;
  };

  return {
    acceptBooking: ({ bookingId, cookId }) => decide({ bookingId, cookId, decision: "accept" }).catch((error) => {
      if (isRetryableDineTransactionError(error)) throw conflict("The booking changed concurrently. Refresh and retry.");
      throw error;
    }),
    rejectBooking: ({ bookingId, cookId }) => decide({ bookingId, cookId, decision: "reject" }).catch((error) => {
      if (isRetryableDineTransactionError(error)) throw conflict("The booking changed concurrently. Refresh and retry.");
      throw error;
    }),
  };
};
