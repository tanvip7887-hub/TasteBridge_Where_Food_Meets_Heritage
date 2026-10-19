const CANCELLABLE_STATUSES = new Set(["PENDING", "ACCEPTED", "CONFIRMED"]);

export const dineCancellationState = (booking, now = Date.now()) => {
  const currentNow = Number.isFinite(now) ? now : Date.now();
  const status = booking?.status;

  if (!CANCELLABLE_STATUSES.has(status)) {
    let reason = "This booking cannot be cancelled in its current state.";
    if (status === "CANCELLED") reason = "This booking is already cancelled.";
    else if (status === "COMPLETED") reason = "Completed bookings cannot be cancelled.";
    else if (status === "REJECTED") reason = "This booking request was declined.";
    else if (status === "EXPIRED") reason = "This booking has expired.";
    return { eligible: false, deadline: null, reason };
  }

  if (booking?.cancellationStatus === "PENDING") {
    return {
      eligible: false,
      deadline: null,
      reason: "Cancellation request is awaiting Cook review.",
      isPendingApproval: true,
    };
  }

  const deadlineRaw = booking?.cancellation?.deadlineAt;

  if (deadlineRaw === null || deadlineRaw === undefined || deadlineRaw === "") {
    return { eligible: false, deadline: null, reason: "Cancellation deadline is unavailable. Refresh your bookings." };
  }

  const deadline = new Date(deadlineRaw).getTime();
  if (!Number.isFinite(deadline)) {
    return { eligible: false, deadline: null, reason: booking?.cancellation?.reason || "Cancellation deadline is unavailable. Refresh your bookings." };
  }

  const confirmed = status === "CONFIRMED";
  const deadlinePassed = confirmed ? currentNow > deadline : currentNow >= deadline;

  if (deadlinePassed) {
    const reason = confirmed
      ? booking?.cancellation?.reason || "Cancellation cutoff has passed."
      : status === "PENDING"
        ? "Booking hold has expired."
        : "Payment deadline has expired.";
    return { eligible: false, deadline: new Date(deadline), reason };
  }

  if (booking?.cancellation?.eligible !== true) {
    return {
      eligible: false,
      deadline: new Date(deadline),
      reason: booking?.cancellation?.reason || "Cancellation is not currently available according to server rules.",
    };
  }

  return { eligible: true, deadline: new Date(deadline), reason: null };
};

