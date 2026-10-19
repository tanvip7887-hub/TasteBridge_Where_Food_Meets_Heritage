/** Delivery-agent panel access is derived from the authenticated API user. */
export const isApprovedDeliveryAgent = (user) => Boolean(
  user?.status === "ACTIVE" &&
  user?.deliveryAgent?.verificationStatus === "APPROVED" &&
  (!Array.isArray(user?.availablePortals) || user.availablePortals.includes("DELIVERY_AGENT"))
);

export default { isApprovedDeliveryAgent };
