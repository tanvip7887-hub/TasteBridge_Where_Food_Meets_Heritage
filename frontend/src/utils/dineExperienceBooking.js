export const MAX_DINE_GUESTS_PER_BOOKING = 3;

export const publicExperienceType = (discoveryType) => {
  if (discoveryType === "dining") return "HOME_DINING";
  if (discoveryType === "workshop") return "WORKSHOP";
  return null;
};

export const bookableGuestLimit = (experience, slot) => {
  const limits = [MAX_DINE_GUESTS_PER_BOOKING, experience?.maxGuests, slot?.availableSeats]
    .filter((limit) => limit !== undefined && limit !== null)
    .map(Number);
  if (!limits.every(Number.isFinite)) return 0;
  return Math.max(0, Math.min(...limits));
};

export const validateDineBookingSelection = ({ experience, slotId, guestCount }) => {
  if (!experience?.id) return "Choose an available experience.";
  const slot = experience.slots?.find((item) => item.id === slotId);
  const count = Number(guestCount);
  if (!slot || !Number.isInteger(count) || count < 1) {
    return "Select an available slot and a valid guest count.";
  }
  if (slot.availableSeats !== undefined && slot.availableSeats !== null && count > Number(slot.availableSeats)) {
    return "Guest count exceeds the seats currently available for this slot.";
  }
  if (count > MAX_DINE_GUESTS_PER_BOOKING) {
    return `Guest count exceeds the maximum limit of ${MAX_DINE_GUESTS_PER_BOOKING} guests per booking.`;
  }
  if (experience.maxGuests !== undefined && experience.maxGuests !== null && count > Number(experience.maxGuests)) {
    return "Guest count exceeds the maximum allowed for this experience.";
  }
  return "";
};


export const createDineBookingPayload = ({ experience, slotId, guestCount, idempotencyKey }) => {
  const error = validateDineBookingSelection({ experience, slotId, guestCount });
  if (error) throw new Error(error);
  if (!idempotencyKey) throw new Error("A booking request key is required. Please try again.");
  return {
    experienceId: experience.id,
    slotId,
    numberOfGuests: Number(guestCount),
    idempotencyKey,
  };
};
