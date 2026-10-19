/**
 * Luhn algorithm validation and card input formatting utilities.
 * All functions operate purely in-memory; no card data is stored or logged.
 */

export const DEMO_FAILURE_CARD = "4000 0000 0000 0002";
export const DEMO_SUCCESS_CARD = "4242 4242 4242 4242";

export const sanitizeDigits = (value = "") => String(value).replace(/\D/g, "");

export const formatCardNumber = (value = "") => {
  const digits = sanitizeDigits(value).slice(0, 16);
  const parts = [];
  for (let i = 0; i < digits.length; i += 4) {
    parts.push(digits.slice(i, i + 4));
  }
  return parts.join(" ");
};

export const formatExpiry = (value = "") => {
  const digits = sanitizeDigits(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

export const isValidLuhn = (rawNumber = "") => {
  const digits = sanitizeDigits(rawNumber);
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
};

export const isValidExpiry = (expiryString = "", referenceDate = new Date()) => {
  const match = String(expiryString).trim().match(/^(\d{2})\/(\d{2})$/);
  if (!match) return false;

  const month = parseInt(match[1], 10);
  const year2Digit = parseInt(match[2], 10);
  if (month < 1 || month > 12) return false;

  const currentYearFull = referenceDate.getFullYear();
  const currentCentury = Math.floor(currentYearFull / 100) * 100;
  const fullYear = currentCentury + year2Digit;
  const currentMonth = referenceDate.getMonth() + 1; // 1-indexed

  if (fullYear < currentYearFull) return false;
  if (fullYear === currentYearFull && month < currentMonth) return false;
  // Reasonable upper bound: max 25 years in the future
  if (fullYear > currentYearFull + 25) return false;

  return true;
};

export const isDemoFailureCard = (rawNumber = "") => {
  const sanitized = sanitizeDigits(rawNumber);
  const failureDigits = sanitizeDigits(DEMO_FAILURE_CARD);
  return sanitized === failureDigits;
};
