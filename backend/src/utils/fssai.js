export const fssaiExpiryAtEndOfDay = (dateValue) => {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const fssaiExpiryHasPassed = (expiryDate, now = new Date()) =>
  Boolean(expiryDate && new Date(expiryDate) <= now);

export const fssaiExpiryDateIsFuture = (dateValue, now = new Date()) => {
  if (typeof dateValue !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return false;
  const parsed = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateValue) return false;
  return dateValue > now.toISOString().slice(0, 10);
};

export const effectiveFssaiStatus = (status, expiryDate, now = new Date()) =>
  status === "APPROVED" && fssaiExpiryHasPassed(expiryDate, now) ? "EXPIRED" : status;

export const statusForFssaiDetails = (statusType) => {
  if (statusType === "APPLIED_ON_FOSCOS") return "IN_PROCESS";
  return "NOT_SUBMITTED";
};
