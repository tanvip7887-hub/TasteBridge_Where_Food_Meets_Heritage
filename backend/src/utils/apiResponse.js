import { currencyNumber, rateNumber } from "./money.js";

const currencyFields = new Set([
  "price", "subtotal", "deliveryFee", "platformFee", "totalAmount",
  "cookEarning", "deliveryEarning", "unitPrice", "totalPrice", "deliveryFeeBase",
  "amount", "totalRevenue", "totalGrossVolume", "totalPlatformRevenue",
  "totalCookEarnings", "totalDeliveryEarnings",
]);

const serializeMoney = (value, field = "") => {
  if (value === null || value === undefined) return value;
  if (currencyFields.has(field)) return currencyNumber(value);
  if (field === "platformFeePercent") return rateNumber(value);
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((item) => serializeMoney(item));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeMoney(item, key)]));
  }
  return value;
};

export const sendSuccess = (res, statusCode = 200, message = "Success", data = null) => {
  const response = {
    success: true,
    message,
  };

  if (data !== null && data !== undefined) {
    response.data = serializeMoney(data);
  }

  return res.status(statusCode).json(response);
};

export const sendError = (res, statusCode = 500, message = "Error", errors = null) => {
  const response = {
    success: false,
    message,
  };

  if (errors !== null && errors !== undefined) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};
