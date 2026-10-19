const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i;
const MAX_CURRENCY_INTEGER_DIGITS = 12;
const MAX_DECIMAL_INPUT_LENGTH = 256;
const MAX_DECIMAL_EXPONENT = 128;

const decimalParts = (value) => {
  const text = typeof value === "string" || typeof value === "number"
    ? String(value)
    : value?.toString?.();
  if (typeof text !== "string" || text.length > MAX_DECIMAL_INPUT_LENGTH) {
    throw new TypeError("Invalid decimal value.");
  }
  const match = text?.trim().match(DECIMAL_PATTERN);
  if (!match) throw new TypeError("Invalid decimal value.");

  const [, sign, whole = "0", fractionA = "", fractionB = "", exponentText = "0"] = match;
  const fraction = fractionA || fractionB;
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_DECIMAL_EXPONENT) {
    throw new RangeError("Decimal exponent is outside the supported range.");
  }
  return {
    negative: sign === "-",
    digits: BigInt(`${whole}${fraction}` || "0"),
    decimalPlaces: fraction.length - exponent,
  };
};

export const toScaledInteger = (value, scale) => {
  if (!Number.isInteger(scale) || scale < 0 || scale > 12) throw new RangeError("Invalid decimal scale.");
  const { negative, digits, decimalPlaces } = decimalParts(value);
  const shift = scale - decimalPlaces;
  let magnitude;

  if (shift >= 0) {
    magnitude = digits * (10n ** BigInt(shift));
  } else {
    const divisor = 10n ** BigInt(-shift);
    const quotient = digits / divisor;
    const remainder = digits % divisor;
    magnitude = quotient + (remainder * 2n >= divisor ? 1n : 0n);
  }

  return negative ? -magnitude : magnitude;
};

export const fromScaledInteger = (value, scale) => {
  const amount = BigInt(value);
  const negative = amount < 0n;
  const magnitude = negative ? -amount : amount;
  if (scale === 0) return `${negative ? "-" : ""}${magnitude}`;
  const divisor = 10n ** BigInt(scale);
  const whole = magnitude / divisor;
  const fraction = (magnitude % divisor).toString().padStart(scale, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
};

export const toPaise = (value) => toScaledInteger(value, 2);
export const rupeesFromPaise = (paise) => fromScaledInteger(paise, 2);
export const rateToTenThousandths = (value) => toScaledInteger(value, 4);
export const rateFromTenThousandths = (value) => fromScaledInteger(value, 4);
export const rateNumber = (value) => Number(rateFromTenThousandths(rateToTenThousandths(value)));

export const currencyNumber = (value) => {
  const paise = toPaise(value);
  const whole = paise / 100n;
  if (whole > BigInt(Number.MAX_SAFE_INTEGER) || whole < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError("Currency amount is too large to serialize as a JSON number.");
  }
  return Number(rupeesFromPaise(paise));
};

export const normalizeCurrency = (value) => {
  const paise = toPaise(value);
  const normalized = rupeesFromPaise(paise);
  const integerDigits = normalized.replace(/^-/, "").split(".")[0].length;
  if (integerDigits > MAX_CURRENCY_INTEGER_DIGITS) throw new RangeError("Currency amount exceeds NUMERIC(14,2).");
  return normalized;
};

export const normalizeRate = (value) => {
  const scaled = rateToTenThousandths(value);
  const normalized = rateFromTenThousandths(scaled);
  const integerDigits = normalized.replace(/^-/, "").split(".")[0].length;
  if (integerDigits > 3) {
    throw new RangeError("Rate exceeds NUMERIC(7,4).");
  }
  return normalized;
};

export const divideRoundHalfUp = (numerator, denominator) => {
  const dividend = BigInt(numerator);
  const divisor = BigInt(denominator);
  if (divisor <= 0n) throw new RangeError("Divisor must be positive.");
  const negative = dividend < 0n;
  const magnitude = negative ? -dividend : dividend;
  const quotient = magnitude / divisor;
  const remainder = magnitude % divisor;
  const rounded = quotient + (remainder * 2n >= divisor ? 1n : 0n);
  return negative ? -rounded : rounded;
};

export const sumPaise = (values) => values.reduce((sum, value) => sum + toPaise(value), 0n);
