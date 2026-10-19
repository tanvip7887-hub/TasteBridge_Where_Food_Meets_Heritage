import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";

/** Cart access is limited to the server-validated Customer portal. */
export const requireCartCustomer = (req, res, next) => {
  if (!req.user) {
    return next(new AppError("Authentication required.", HTTP_STATUS.UNAUTHORIZED));
  }
  if (req.user.status !== "ACTIVE") {
    return next(new AppError("Account is not active.", HTTP_STATUS.FORBIDDEN));
  }
  if (req.user.activePortal !== "CUSTOMER") {
    return next(new AppError("Switch to the Customer portal to use a cart.", HTTP_STATUS.FORBIDDEN));
  }
  return next();
};
