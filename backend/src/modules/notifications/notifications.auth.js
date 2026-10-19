import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";

const PORTALS = new Set(["CUSTOMER", "COOK", "DELIVERY_AGENT"]);

/**
 * authenticate() resolves activePortal from the signed session and current
 * database approval state. This middleware makes the notification scope
 * explicit and prevents ADMIN or an unapproved applicant from using it.
 */
export const requireNotificationPortal = (req, res, next) => {
  const user = req.user;
  if (!user) return next(new AppError("Authentication required.", HTTP_STATUS.UNAUTHORIZED));

  const portal = user.activePortal;
  const approvedCook = portal === "COOK" && user.cookProfile?.verificationStatus === "APPROVED";
  const approvedDeliveryAgent = portal === "DELIVERY_AGENT" && user.deliveryAgent?.verificationStatus === "APPROVED";
  const customer = portal === "CUSTOMER";

  if (!PORTALS.has(portal) || !(customer || approvedCook || approvedDeliveryAgent) || user.status !== "ACTIVE") {
    return next(new AppError("Access denied for this notification portal.", HTTP_STATUS.FORBIDDEN));
  }

  req.notificationPortal = portal;
  next();
};
