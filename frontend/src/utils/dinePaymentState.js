export const DINE_PAYMENT_ATTEMPT_LIMIT = 3;

export const remainingPaymentMilliseconds = (deadline, now = Date.now()) => {
  if (deadline === null || deadline === undefined || deadline === "") return null;
  const expiresAt = new Date(deadline).getTime();
  if (!Number.isFinite(expiresAt) || !Number.isFinite(now)) return null;
  return Math.max(0, expiresAt - now);
};

export const formatPaymentCountdown = (milliseconds) => {
  const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export const dinePaymentState = (booking, now = Date.now()) => {
  const attempts = Array.isArray(booking?.paymentAttempts) ? booking.paymentAttempts : [];
  const succeeded = attempts.some((attempt) => attempt.status === "SUCCEEDED");
  const pendingAttempt = [...attempts].reverse().find((attempt) => attempt.status === "PENDING");
  const remainingMilliseconds = remainingPaymentMilliseconds(booking?.paymentExpiresAt, now);
  const clockValid = Number.isFinite(now);
  const deadlineValid = booking?.paymentExpiresAt !== null
    && booking?.paymentExpiresAt !== undefined
    && Number.isFinite(new Date(booking.paymentExpiresAt).getTime());
  const expired = booking?.status === "EXPIRED" || (deadlineValid && clockValid && remainingMilliseconds <= 0);
  const pendingAttemptRemaining = pendingAttempt ? remainingPaymentMilliseconds(pendingAttempt.expiresAt, now) : null;
  const pendingAttemptExpired = Boolean(pendingAttempt && pendingAttemptRemaining !== null && pendingAttemptRemaining <= 0);
  const attemptLimitReached = attempts.length >= DINE_PAYMENT_ATTEMPT_LIMIT;
  const eligible = booking?.status === "ACCEPTED" && deadlineValid && clockValid && !expired && !pendingAttemptExpired && !succeeded && !attemptLimitReached;
  return { attempts, succeeded, pendingAttempt, remainingMilliseconds, deadlineValid, clockValid, expired, pendingAttemptExpired, attemptLimitReached, eligible };
};
