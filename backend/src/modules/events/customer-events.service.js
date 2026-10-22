import { currencyNumber, normalizeCurrency } from "../../utils/money.js";
import { isIP } from "node:net";

const DEFAULT_CANCELLATION_WINDOW_HOURS = 48;

const publicImageUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
    if (isIP(host) || !host.includes(".")) return null;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host) || host === "0.0.0.0" || host === "::1") return null;
    const private172 = host.match(/^172\.(\d+)\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return null;
    return url.toString();
  } catch {
    return null;
  }
};

const normalizeCategoryName = (value) => String(value || "").trim().toLocaleLowerCase()
  .replace(/\brajasthani\b/g, "rajasthan")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

// Keep the booking thumbnail priority aligned with frontend/src/utils/bookingPresentation.js:
// matching menu dish, curated regional image, category image, saved experience photos/image.
const regionalImages = Object.freeze({
  andhra: "https://media-assets.swiggy.com/swiggy/image/upload/f_auto%2Cq_auto%2Cfl_lossy/u4e93kbc8bvekwrivvgb",
  bengali: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9b/Mishti_doi.jpg/960px-Mishti_doi.jpg",
  goan: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/Goan_Fish_Curry.jpg/960px-Goan_Fish_Curry.jpg",
  gujarati: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/52/Ahmedabad-gujarati_thali.jpg/960px-Ahmedabad-gujarati_thali.jpg",
  hyderabadi: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bb/Hyderabadi_chicken_biriyani.jpg/960px-Hyderabadi_chicken_biriyani.jpg",
  kashmiri: "https://etoiledukashmir.fr/images/posts/rogan-josh.webp",
  kerala: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f1/Appam_and_stew.jpg/500px-Appam_and_stew.jpg",
  maharashtrian: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Puran-Poli.jpg/960px-Puran-Poli.jpg",
  "north-indian": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Spicy_Chole_Bhature.jpg/960px-Spicy_Chole_Bhature.jpg",
});

const normalizeCuisine = (value) => String(value || "")
  .toLocaleLowerCase()
  .replace(/\brajasthani\b/g, "rajasthan")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const diningImage = (experience, categories) => {
  const cuisineNames = [experience.cuisine, experience.theme].map(normalizeCuisine).filter(Boolean);
  const matchingDish = cuisineNames.length
    ? (experience.menuItems || []).find(({ dish }) => {
      const dishCuisine = normalizeCuisine(dish?.cuisine);
      return dish?.image && dishCuisine && cuisineNames.some((cuisine) => dishCuisine.includes(cuisine) || cuisine.includes(dishCuisine));
    })?.dish?.image
    : null;
  const theme = normalizeCategoryName(experience.theme);
  const cuisine = normalizeCategoryName(experience.cuisine);
  const category = (categories || []).find((item) => [item.name, item.slug]
    .some((value) => [theme, cuisine].includes(normalizeCategoryName(value))));
  const regionalKey = [category?.slug, category?.name].map(normalizeCategoryName).find((key) => regionalImages[key]);
  return publicImageUrl(matchingDish)
    || publicImageUrl(regionalImages[regionalKey])
    || publicImageUrl(category?.image)
    || publicImageUrl(experience.photos?.[0])
    || publicImageUrl(experience.image);
};

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
    const [bookings, settings, categories] = await Promise.all([database.experienceBooking.findMany({
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
        experience: { select: {
          title: true,
          location: true,
          type: true,
          theme: true,
          image: true,
          photos: true,
          cuisine: true,
          menuItems: {
            orderBy: { sortOrder: "asc" },
            select: { dish: { select: { name: true, image: true, cuisine: true } } },
          },
          cook: { select: { businessName: true, profileImage: true } },
        } },
        slot: { select: { id: true, startsAt: true, status: true, availableSeats: true, capacity: true } },
      },
    }), database.platformSettings?.findUnique
      ? database.platformSettings.findUnique({ where: { id: "default" } })
      : null,
    database.foodCategory?.findMany
      ? database.foodCategory.findMany({ where: { isActive: true }, select: { name: true, slug: true, image: true } })
      : []]);

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
        kitchenName: booking.experience.cook?.businessName || null,
        kitchenPhotoUrl: publicImageUrl(booking.experience.cook?.profileImage),
        experienceImageUrl: diningImage(booking.experience, categories),
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
