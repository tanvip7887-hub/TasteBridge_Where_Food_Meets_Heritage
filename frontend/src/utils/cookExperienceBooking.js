export const getScheduledCompletionAt = (booking) => {
  if (!booking) return null;
  const raw = booking.slot?.endsAt || booking.bookingDate;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

export const isCompletionAllowed = (booking, at = new Date()) => {
  if (booking?.cancellationStatus === "PENDING") return false;
  const scheduledEnd = getScheduledCompletionAt(booking);
  if (!scheduledEnd) return false;
  const currentTime = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(currentTime.getTime())) return false;
  return currentTime >= scheduledEnd;
};
