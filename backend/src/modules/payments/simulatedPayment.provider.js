import { randomBytes } from "node:crypto";
import { HTTP_STATUS } from "../../constants/index.js";
import { AppError } from "../../utils/AppError.js";
import { normalizeCurrency, toPaise } from "../../utils/money.js";

const METHOD_LABEL = "TasteBridge simulated payment";

const operationUnavailable = (operation) => new AppError(
  `Simulated payment ${operation} is not enabled until the online checkout workflow is implemented.`,
  HTTP_STATUS.SERVICE_UNAVAILABLE,
);

/**
 * A deterministic demo provider. The optional mockOutcome selects a demo
 * scenario; it is never treated as a provider credential or payment proof.
 * The service still owns verification and fulfillment. A real provider must
 * replace this adapter before real collection.
 */
export const createSimulatedPaymentProvider = ({ now = () => new Date() } = {}) => ({
  async createPayment({ amount, currency = "INR", expiresAt }) {
    let normalizedAmount;
    try {
      normalizedAmount = normalizeCurrency(amount);
    } catch {
      normalizedAmount = null;
    }
    if (!normalizedAmount || toPaise(normalizedAmount) <= 0n) {
      throw new AppError("Payment amount must be a positive server-calculated amount.", HTTP_STATUS.BAD_REQUEST);
    }
    if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
      throw new AppError("Payment currency must be a valid three-letter code.", HTTP_STATUS.BAD_REQUEST);
    }

    const expiry = expiresAt instanceof Date ? new Date(expiresAt) : new Date(expiresAt);
    if (!Number.isFinite(expiry.getTime()) || expiry <= now()) {
      throw new AppError("Payment expiry must be a future date.", HTTP_STATUS.BAD_REQUEST);
    }

    return {
      reference: `TB-SIM-${randomBytes(16).toString("hex").toUpperCase()}`,
      amount: normalizedAmount,
      currency,
      method: "SIMULATED",
      methodLabel: METHOD_LABEL,
      status: "PENDING",
      expiresAt: expiry,
    };
  },

  async confirmPayment({ reference, mockOutcome } = {}) {
    if (typeof reference !== "string" || !/^TB-SIM-[A-F0-9]{32}$/.test(reference)) {
      throw new AppError("Simulated payment reference is invalid.", HTTP_STATUS.BAD_REQUEST);
    }
    const outcome = typeof mockOutcome === "string" ? mockOutcome.toUpperCase() : mockOutcome;
    if (outcome !== undefined && outcome !== "SUCCESS" && outcome !== "FAILURE") {
      throw new AppError("Mock outcome must be SUCCESS or FAILURE.", HTTP_STATUS.BAD_REQUEST);
    }
    if (outcome === undefined) {
      throw new AppError("Choose Simulate Success or Simulate Failure for this mock payment.", HTTP_STATUS.BAD_REQUEST);
    }
    const status = outcome === "SUCCESS" ? "SUCCEEDED" : "FAILED";
    if (status !== "SUCCEEDED" && status !== "FAILED") {
      throw operationUnavailable("confirmation");
    }
    return { reference, status };
  },

  async refundPayment() {
    throw operationUnavailable("refund");
  },
});

export const simulatedPaymentProvider = createSimulatedPaymentProvider();
