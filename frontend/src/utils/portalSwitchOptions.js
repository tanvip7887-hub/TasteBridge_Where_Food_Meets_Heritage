import { isApprovedCook } from "./cookAuth.js";
import { isApprovedDeliveryAgent } from "./deliveryAgentAuth.js";

export const isDeliveryAgentAccount = (user) => Boolean(
  user?.accountRole === "DELIVERY_AGENT" ||
  user?.role === "DELIVERY_AGENT" ||
  user?.deliveryAgent
);

/**
 * Portal switch controls for the current customer-facing navbar.
 * Approved delivery-agent accounts use Customer and Delivery Agent switching;
 * an overlapping Cook approval does not add a third navbar option.
 * Cook-only accounts retain their existing Cook portal entry point.
 */
export const getNavbarPortalSwitchOptions = (user) => {
  const activePortal = user?.activePortal || user?.role;
  const approvedDeliveryAgent = isApprovedDeliveryAgent(user);

  return {
    showCook: isApprovedCook(user) && !approvedDeliveryAgent && activePortal !== "COOK",
    showDeliveryAgent: approvedDeliveryAgent && activePortal !== "DELIVERY_AGENT",
  };
};

export default getNavbarPortalSwitchOptions;
