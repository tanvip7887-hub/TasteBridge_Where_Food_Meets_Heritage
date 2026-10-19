import { createHash } from "node:crypto";
import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { getCookSellingReadiness } from "../../utils/cookReadiness.js";
import { currencyNumber, normalizeCurrency, toPaise, rupeesFromPaise } from "../../utils/money.js";
import { createNotificationsService } from "../notifications/notifications.service.js";
import {
  expireDueBookingsForSlot,
  isRetryableDineTransactionError,
  runSerializableWithRetry,
} from "./dine-booking-expiry.service.js";

const DEFAULT_COOK_RESPONSE_HOURS = 24;
const DEFAULT_BOOKING_CUTOFF_HOURS = 6;
export const MAX_DINE_GUESTS_PER_BOOKING = 3;

const badRequest = (message) => new AppError(message, HTTP_STATUS.BAD_REQUEST);
const forbidden = () => new AppError("Customer account access is required.", HTTP_STATUS.FORBIDDEN);
const notFound = () => new AppError("Experience or slot not found.", HTTP_STATUS.NOT_FOUND);
const conflict = (message) => new AppError(message, HTTP_STATUS.CONFLICT);

const bookingSelect = {
  id: true,
  experienceId: true,
  slotId: true,
  bookingDate: true,
  numberOfGuests: true,
  totalAmount: true,
  pricePerPersonSnapshot: true,
  totalAmountSnapshot: true,
  status: true,
  holdExpiresAt: true,
  expiredAt: true,
  acceptedAt: true,
  rejectedAt: true,
  paymentExpiresAt: true,
  createdAt: true,
};

const requestFingerprint = ({ experienceId, slotId, numberOfGuests }) => createHash("sha256")
  .update(JSON.stringify({ experienceId, slotId, numberOfGuests }))
  .digest("hex");

const serializeBooking = (booking) => ({
  id: booking.id,
  experienceId: booking.experienceId,
  slotId: booking.slotId,
  bookingDate: booking.bookingDate,
  numberOfGuests: booking.numberOfGuests,
  pricePerPerson: booking.pricePerPersonSnapshot === null ? null : currencyNumber(booking.pricePerPersonSnapshot),
  totalAmount: booking.totalAmountSnapshot === null ? booking.totalAmount : currencyNumber(booking.totalAmountSnapshot),
  status: booking.status,
  holdExpiresAt: booking.holdExpiresAt,
  acceptedAt: booking.acceptedAt,
  rejectedAt: booking.rejectedAt,
  paymentExpiresAt: booking.paymentExpiresAt,
  createdAt: booking.createdAt,
});

const settingsFor = async (tx) => ({
  experienceCookResponseWindowHours: DEFAULT_COOK_RESPONSE_HOURS,
  experienceBookingCutoffHours: DEFAULT_BOOKING_CUTOFF_HOURS,
  experiencePaymentHoldMinutes: 15,
  ...((await tx.platformSettings.findUnique({ where: { id: "default" } })) || {}),
});

const loadIdempotentBooking = (tx, customerId, idempotencyKey) => tx.experienceBooking.findFirst({
  where: { customerId, idempotencyKey },
  select: { ...bookingSelect, requestFingerprint: true },
});

export const createDineBookingsService = (
  database,
  { now = () => new Date(), notificationServiceFactory = createNotificationsService, readiness = getCookSellingReadiness } = {},
) => ({
  async createBooking(customerId, input) {
    if (!customerId) throw forbidden();
    if (!input?.idempotencyKey || !input?.experienceId || !input?.slotId) throw badRequest("Experience, slot, and idempotency key are required.");

    const fingerprint = requestFingerprint(input);
    const at = now();
    const execute = async () => runSerializableWithRetry(database, async (tx) => {
      const previous = await loadIdempotentBooking(tx, customerId, input.idempotencyKey);
      if (previous) {
        if (previous.requestFingerprint !== fingerprint) {
          throw conflict("This idempotency key was already used for a different booking request.");
        }
        if (previous.status === "PENDING" && previous.holdExpiresAt && previous.holdExpiresAt <= at) {
          if (previous.slotId) await expireDueBookingsForSlot(tx, previous.slotId, at, notificationServiceFactory);
          const expired = await loadIdempotentBooking(tx, customerId, input.idempotencyKey);
          return serializeBooking(expired);
        }
        return serializeBooking(previous);
      }

      // Share-lock the experience row while validating its published price and
      // guest limit. Cook draft updates take a write lock on this row.
      await tx.$queryRaw`SELECT "id" FROM "Experience" WHERE "id" = ${input.experienceId} FOR SHARE`;
      const experience = await tx.experience.findFirst({
        where: { id: input.experienceId, status: "PUBLISHED" },
        include: {
          cook: { include: { user: true } },
          menuItems: { select: { dishId: true } },
        },
      });
      if (!experience || !experience.cook?.userId) throw notFound();
      const cookReadiness = readiness(experience.cook, at);
      if (!cookReadiness.readyToSell) throw conflict("This experience is not currently available for booking.");
      const hasDineMenu = experience.menuItems?.length > 0 || Boolean(experience.menuNotes?.trim());
      const completeDine = experience.type === "HOME_DINING" && experience.cuisine?.trim() && hasDineMenu;
      const completeWorkshop = experience.type === "WORKSHOP"
        && experience.teachingContent?.trim() && experience.learningOutcomes?.trim() && experience.image;
      if (!experience.title?.trim() || !experience.theme?.trim() || !experience.description?.trim()
        || !experience.publicArea?.trim() || !experience.privateAddress?.trim() || !experience.addressSource
        || (!experience.photos?.length && !experience.image) || !(completeDine || completeWorkshop)) {
        throw conflict("This experience is not currently available for booking.");
      }
      if (!Number.isInteger(input.numberOfGuests) || input.numberOfGuests < 1
        || input.numberOfGuests > MAX_DINE_GUESTS_PER_BOOKING || input.numberOfGuests > experience.maxGuests) {
        throw badRequest(`Guest count must be between 1 and ${MAX_DINE_GUESTS_PER_BOOKING} guests per booking.`);
      }
      let unitPrice;
      try { unitPrice = normalizeCurrency(experience.pricePerPerson); }
      catch { throw conflict("This experience does not have a valid booking price."); }
      if (toPaise(unitPrice) <= 0n) throw conflict("This experience does not have a valid booking price.");

      const settings = await settingsFor(tx);
      const cutoffAt = new Date(at.getTime() + settings.experienceBookingCutoffHours * 60 * 60 * 1000);
      const slot = await tx.experienceSlot.findFirst({
        where: { id: input.slotId, experienceId: input.experienceId, status: "OPEN" },
        select: { id: true, startsAt: true, endsAt: true, capacity: true, availableSeats: true, status: true },
      });
      if (!slot) throw notFound();
      if (slot.startsAt <= cutoffAt || slot.endsAt <= at) throw conflict("This slot is inside the booking cutoff or has already started.");
      if (input.numberOfGuests > slot.capacity) throw badRequest("Guest count exceeds this slot's capacity.");

      await expireDueBookingsForSlot(tx, slot.id, at, notificationServiceFactory);
      const expiredAwareSlot = await tx.experienceSlot.findUnique({ where: { id: slot.id } });
      if (!expiredAwareSlot || expiredAwareSlot.status !== "OPEN" || expiredAwareSlot.startsAt <= cutoffAt) {
        throw conflict("This slot is no longer available for booking.");
      }
      if (expiredAwareSlot.availableSeats < input.numberOfGuests) throw conflict("Not enough seats remain in this slot.");

      const changed = await tx.experienceSlot.updateMany({
        where: {
          id: slot.id,
          experienceId: input.experienceId,
          status: "OPEN",
          startsAt: { gt: cutoffAt },
          availableSeats: { gte: input.numberOfGuests },
        },
        data: { availableSeats: { decrement: input.numberOfGuests } },
      });
      if (changed.count !== 1) throw conflict("Not enough seats remain in this slot.");

      const totalAmountSnapshot = rupeesFromPaise(toPaise(unitPrice) * BigInt(input.numberOfGuests));
      const holdExpiresAt = new Date(Math.min(
        at.getTime() + settings.experienceCookResponseWindowHours * 60 * 60 * 1000,
        slot.startsAt.getTime() - settings.experienceBookingCutoffHours * 60 * 60 * 1000
          - settings.experiencePaymentHoldMinutes * 60 * 1000,
      ));
      if (holdExpiresAt <= at) throw conflict("There is not enough time for a Cook response and full payment window before the booking cutoff.");

      const booking = await tx.experienceBooking.create({
        data: {
          experienceId: experience.id,
          customerId,
          slotId: slot.id,
          bookingDate: slot.startsAt,
          numberOfGuests: input.numberOfGuests,
          totalAmount: Number(totalAmountSnapshot),
          pricePerPersonSnapshot: unitPrice,
          totalAmountSnapshot,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: fingerprint,
          holdExpiresAt,
          status: "PENDING",
        },
        select: bookingSelect,
      });

      await notificationServiceFactory(tx).create({
        userId: experience.cook.userId,
        portal: "COOK",
        type: "ORDER_ALERT",
        title: "New experience booking request",
        message: `${input.numberOfGuests} guest${input.numberOfGuests === 1 ? "" : "s"} requested ${experience.title}. Respond before the hold expires.`,
        metadata: {
          kind: "EXPERIENCE_BOOKING_REQUESTED",
          bookingId: booking.id,
          experienceId: experience.id,
          href: experience.type === "WORKSHOP" ? "/cook/workshop-bookings" : "/cook/dine-bookings",
        },
        eventKey: `experience-booking:${booking.id}:requested:cook:${experience.cook.userId}`,
      });

      return serializeBooking(booking);
    });

    try {
      return await execute();
    } catch (error) {
        if (error?.code === "P2002") {
          const existing = await loadIdempotentBooking(database, customerId, input.idempotencyKey);
          if (existing) {
            if (existing.requestFingerprint !== fingerprint) throw conflict("This idempotency key was already used for a different booking request.");
            return serializeBooking(existing);
          }
          throw error;
        }
        if (isRetryableDineTransactionError(error)) {
          throw conflict("The slot changed during booking. Please retry with the same idempotency key.");
        }
        throw error;
    }
  },
});
