/**
 * Helper utilities to check cook verification and permission status
 * derived directly from the authenticated backend user object.
 */

export const isApprovedCook = (user) => {
  if (!user) return false;
  return user.cookProfile?.verificationStatus === "APPROVED"
    && (!Array.isArray(user.availablePortals) || user.availablePortals.includes("COOK"));
};

export const canLoadCookNotifications = (user) =>
  user?.activePortal === "COOK" && isApprovedCook(user);

export const getCookStatus = (user) => {
  if (!user) return null;
  if (isApprovedCook(user)) return "APPROVED";
  return user.cookProfile?.verificationStatus || null;
};

export default {
  isApprovedCook,
  canLoadCookNotifications,
  getCookStatus,
};
