import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";

/** Customer checkout and order-history routes are also available to approved cooks. */
export const requireCustomerOrderAccess = (req, res, next) => {
  if (!req.user) {
    return next(new AppError("Authentication required.", HTTP_STATUS.UNAUTHORIZED));
  }
  if (req.user.status !== "ACTIVE") {
    return next(new AppError("Account is not active.", HTTP_STATUS.FORBIDDEN));
  }

  if (req.user.activePortal !== "CUSTOMER") {
    return next(new AppError("Switch to the Customer portal to access customer orders.", HTTP_STATUS.FORBIDDEN));
  }
  return next();
};
