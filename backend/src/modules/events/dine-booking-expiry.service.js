import { createNotificationsService } from "../notifications/notifications.service.js";

const DEFAULT_BATCH_SIZE = 100;
const MAX_RETRY_ATTEMPTS = 3;

const isRetryableTransactionError = (error) => {
  const codes = [
    error?.code,
    error?.meta?.code,
    error?.cause?.code,
    error?.originalCode,
    error?.meta?.driverAdapterError?.cause?.originalCode,
  ];
  return codes.some((code) => ["P2034", "40001", "40P01"].includes(code));
};

const transactionErrorCode = (error) => error?.code || error?.cause?.code
  || error?.meta?.driverAdapterError?.cause?.originalCode || "serialization";

const retryDelay = (attempt) => new Promise((resolve) => setTimeout(resolve, attempt * 20));

const withExpiryStage = async (stage, operation) => {
  try {
    return await operation();
  } catch (error) {
    if (error && (typeof error === "object" || typeof error === "function")) {
      try {
        Object.defineProperty(error, "dineExpiryStage", { configurable: true, value: stage });
      } catch {
        // Keep the original database error intact if it cannot be annotated.
      }
    }
    throw error;
  }
};

export const runSerializableWithRetry = async (
  database,
  operation,
  { maxAttempts = MAX_RETRY_ATTEMPTS, onRetry } = {},
) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await database.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === maxAttempts) throw error;
      onRetry?.({ attempt, code: transactionErrorCode(error) });
      await retryDelay(attempt);
    }
  }
  throw new Error("Serializable transaction retry limit reached.");
};

const lockDueForSlot = (tx, slotId, at) => tx.$queryRaw`
  SELECT "id", "slotId", "customerId", "numberOfGuests", "status", "cancellationStatus"
  FROM "ExperienceBooking"
  WHERE "slotId" = ${slotId}
    AND (
      ("status" = 'PENDING'::"BookingStatus" AND "holdExpiresAt" IS NOT NULL AND "holdExpiresAt" <= ${at})
      OR ("status" = 'ACCEPTED'::"BookingStatus" AND "paymentExpiresAt" IS NOT NULL AND "paymentExpiresAt" <= ${at})
    )
  ORDER BY "slotId" ASC, "id" ASC
  FOR UPDATE
`;

const lockDueForExperience = (tx, experienceId, at) => tx.$queryRaw`
  SELECT "id", "slotId", "customerId", "numberOfGuests", "status", "cancellationStatus"
  FROM "ExperienceBooking"
  WHERE "experienceId" = ${experienceId}
    AND "slotId" IS NOT NULL
    AND (
      ("status" = 'PENDING'::"BookingStatus" AND "holdExpiresAt" IS NOT NULL AND "holdExpiresAt" <= ${at})
      OR ("status" = 'ACCEPTED'::"BookingStatus" AND "paymentExpiresAt" IS NOT NULL AND "paymentExpiresAt" <= ${at})
    )
  ORDER BY "slotId" ASC, "id" ASC
  FOR UPDATE
`;

const lockDueBatch = (tx, at, batchSize) => withExpiryStage("due-booking-lock", () => tx.$queryRaw`
  SELECT "id", "slotId", "customerId", "numberOfGuests", "status", "cancellationStatus"
  FROM "ExperienceBooking"
  WHERE "slotId" IS NOT NULL
    AND (
      ("status" = 'PENDING'::"BookingStatus" AND "holdExpiresAt" IS NOT NULL AND "holdExpiresAt" <= ${at})
      OR ("status" = 'ACCEPTED'::"BookingStatus" AND "paymentExpiresAt" IS NOT NULL AND "paymentExpiresAt" <= ${at})
    )
  ORDER BY "slotId" ASC, "id" ASC
    LIMIT CAST(${batchSize} AS INTEGER)
  FOR UPDATE SKIP LOCKED
`);

export const releaseDineBookingSeats = async (tx, slotId, seats) => {
  if (!slotId || !Number.isInteger(seats) || seats < 1) throw new Error("A Dine seat release requires a slot and positive guest count.");
  const changed = await withExpiryStage("seat-release", () => tx.$queryRaw`
    UPDATE "ExperienceSlot"
    SET "availableSeats" = "availableSeats" + CAST(${seats} AS INTEGER), "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${slotId}
      AND "status" IN ('OPEN'::"ExperienceSlotStatus", 'PAUSED'::"ExperienceSlotStatus")
      AND "availableSeats" + CAST(${seats} AS INTEGER) <= "capacity"
    RETURNING "id"
  `);
  if (changed.length !== 1) throw new Error("A Dine booking could not restore seats to its open slot.");
};

const notifyCustomerTimeout = (tx, notificationServiceFactory, booking) => notificationServiceFactory(tx).create({
  userId: booking.customerId,
  portal: "CUSTOMER",
  type: "ORDER_ALERT",
  title: "Your experience request expired",
  message: "The Cook response window ended before the request was accepted. The reserved seats have been released.",
  metadata: { kind: "EXPERIENCE_BOOKING_RESPONSE_EXPIRED", bookingId: booking.id, href: "/my-events" },
  eventKey: `experience-booking:${booking.id}:response-timeout:customer:${booking.customerId}`,
});

const notifyCustomerPaymentTimeout = (tx, notificationServiceFactory, booking) => notificationServiceFactory(tx).create({
  userId: booking.customerId,
  portal: "CUSTOMER",
  type: "ORDER_ALERT",
  title: "Your experience payment window expired",
  message: "The payment deadline passed before payment was confirmed. The reserved seats have been released.",
  metadata: { kind: "EXPERIENCE_BOOKING_PAYMENT_EXPIRED", bookingId: booking.id, href: "/my-events" },
  eventKey: `experience-booking:${booking.id}:payment-timeout:customer:${booking.customerId}`,
});

const expireLockedBookings = async (tx, bookings, at, notificationServiceFactory) => {
  const seatsBySlot = new Map();
  let expiredCount = 0;

  for (const booking of bookings) {
    if (!booking.slotId || !Number.isInteger(booking.numberOfGuests) || booking.numberOfGuests < 1) {
      throw new Error("A due Dine booking has invalid slot or guest data.");
    }
    const isPaymentTimeout = booking.status === "ACCEPTED";
    const changed = await tx.experienceBooking.updateMany({
      where: isPaymentTimeout
        ? { id: booking.id, status: "ACCEPTED", paymentExpiresAt: { lte: at } }
        : { id: booking.id, status: "PENDING", holdExpiresAt: { lte: at } },
      data: {
        status: "EXPIRED",
        expiredAt: at,
        ...(booking.cancellationStatus === "PENDING" ? { cancellationStatus: "EXPIRED" } : {}),
      },
    });
    if (changed.count !== 1) continue;
    expiredCount += 1;
    seatsBySlot.set(booking.slotId, (seatsBySlot.get(booking.slotId) || 0) + booking.numberOfGuests);
    if (isPaymentTimeout) {
      const attempts = await tx.experiencePaymentAttempt.findMany({
        where: { experienceBookingId: booking.id, status: "PENDING" },
        select: { id: true },
        orderBy: [{ attemptNumber: "asc" }, { id: "asc" }],
      });
      const expired = await tx.experiencePaymentAttempt.updateMany({
        where: { experienceBookingId: booking.id, status: "PENDING", expiresAt: { lte: at } },
        data: { status: "EXPIRED" },
      });
      if (expired.count !== attempts.length) throw new Error("A Dine payment attempt changed while its booking was expiring.");
      for (const attempt of attempts) {
        await tx.experiencePaymentEvent.create({
          data: {
            paymentAttemptId: attempt.id,
            provider: "SIMULATED",
            fromStatus: "PENDING",
            toStatus: "EXPIRED",
            verificationMode: null,
            reasonCode: "BOOKING_PAYMENT_TIMEOUT",
            providerEventKey: `dine-payment:${attempt.id}:expired`,
          },
        });
      }
      await notifyCustomerPaymentTimeout(tx, notificationServiceFactory, booking);
    } else {
      await notifyCustomerTimeout(tx, notificationServiceFactory, booking);
    }
  }

  // All paths lock due booking rows by slot/id, then update slot rows in slot/id
  // order. The guarded booking transition makes the release exactly once.
  for (const [slotId, seats] of [...seatsBySlot.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    await releaseDineBookingSeats(tx, slotId, seats);
  }

  return { expiredCount, releasedSeats: [...seatsBySlot.values()].reduce((sum, seats) => sum + seats, 0) };
};

export const expireDueBookingsForSlot = async (tx, slotId, at, notificationServiceFactory = createNotificationsService) => {
  const due = await lockDueForSlot(tx, slotId, at);
  return expireLockedBookings(tx, due, at, notificationServiceFactory);
};

export const expireDueBookingsForExperience = async (tx, experienceId, at, notificationServiceFactory = createNotificationsService) => {
  const due = await lockDueForExperience(tx, experienceId, at);
  return expireLockedBookings(tx, due, at, notificationServiceFactory);
};

export const createDineBookingExpiryService = (
  database,
  { now = () => new Date(), batchSize = DEFAULT_BATCH_SIZE, onRetry, notificationServiceFactory = createNotificationsService } = {},
) => ({
  async runBatch() {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
      throw new RangeError("Dine expiry batch size must be between 1 and 1000.");
    }
    return runSerializableWithRetry(database, async (tx) => {
      const at = now();
      const due = await lockDueBatch(tx, at, batchSize);
      return expireLockedBookings(tx, due, at, notificationServiceFactory);
    }, { onRetry });
  },
});

export const isRetryableDineTransactionError = isRetryableTransactionError;
