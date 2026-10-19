export const getAvailablePortals = (user) => {
  if (!user || user.status !== "ACTIVE") return [];
  if (user.role === "ADMIN") return ["ADMIN"];

  const portals = ["CUSTOMER"];
  if (user.cookProfile?.verificationStatus === "APPROVED") portals.push("COOK");
  if (user.deliveryAgent?.verificationStatus === "APPROVED") portals.push("DELIVERY_AGENT");
  return portals;
};

export const resolveActivePortal = (user, requestedPortal) => {
  const availablePortals = getAvailablePortals(user);
  if (requestedPortal && availablePortals.includes(requestedPortal)) return requestedPortal;
  if (availablePortals.includes(user?.role)) return user.role;
  return availablePortals[0] || null;
};

export const serializePortalUser = (user, requestedPortal) => {
  if (!user) return user;
  const { passwordHash, ...safeUser } = user;
  const availablePortals = getAvailablePortals(user);
  const activePortal = resolveActivePortal(user, requestedPortal);
  return {
    ...safeUser,
    accountRole: user.role,
    role: activePortal,
    activePortal,
    availablePortals,
  };
};
