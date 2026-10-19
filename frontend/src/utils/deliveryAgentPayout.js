export const normalizeDeliveryAgentPayoutDetails = (details) => {
  const source = details && typeof details === "object" ? details : {};
  return {
    upiId: typeof source.upiId === "string" ? source.upiId.trim() : "",
    accountHolderName: typeof source.accountHolderName === "string" ? source.accountHolderName.trim() : "",
  };
};

export const getDeliveryAgentPayoutValidationError = (details) => {
  const normalized = normalizeDeliveryAgentPayoutDetails(details);
  const upiPattern = /^[A-Za-z0-9][A-Za-z0-9._+-]{1,255}@[A-Za-z0-9][A-Za-z0-9.-]{1,63}$/;
  if (normalized.upiId.length < 3 || normalized.upiId.length > 320 || !upiPattern.test(normalized.upiId)) {
    return "Enter a valid UPI ID, such as name@bank.";
  }
  if (normalized.accountHolderName.length < 2 || normalized.accountHolderName.length > 100) {
    return "Enter the UPI account holder name (2 to 100 characters).";
  }
  return "";
};
