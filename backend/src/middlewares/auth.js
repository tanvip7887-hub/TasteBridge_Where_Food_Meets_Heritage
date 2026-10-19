import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import env from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { HTTP_STATUS } from "../constants/index.js";
import { getAvailablePortals, resolveActivePortal } from "../modules/auth/portal-access.js";

// Authenticate JWT middleware
export const createAuthenticate = (
  findUser = (query) => prisma.user.findUnique(query)
) => async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    if (!token) {
      throw new AppError("Authentication required. Please log in.", HTTP_STATUS.UNAUTHORIZED);
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET || process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        throw new AppError("Authentication token expired. Please log in again.", HTTP_STATUS.UNAUTHORIZED);
      }
      throw new AppError("Invalid authentication token.", HTTP_STATUS.UNAUTHORIZED);
    }

    // Load actual user from PostgreSQL database
    const user = await findUser({
      where: { id: decoded.userId },
      include: {
        cookProfile: {
          select: {
            id: true,
            businessName: true,
            profileImage: true,
            isOpen: true,
            verificationStatus: true,
            isApprovedToSell: true,
          },
        },
        deliveryAgent: {
          select: {
            id: true,
            verificationStatus: true,
            isAvailable: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError("User account no longer exists.", HTTP_STATUS.UNAUTHORIZED);
    }

    assertActiveAccount(user);

    // Attach safe user object to request
    const activePortal = resolveActivePortal(user, decoded.activePortal || decoded.role);
    const safeUser = { ...user };
    delete safeUser.passwordHash;
    safeUser.accountRole = user.role;
    safeUser.availablePortals = getAvailablePortals(user);
    safeUser.activePortal = activePortal;
    // Downstream role middleware consumes the server-validated active portal.
    safeUser.role = activePortal;
    req.user = safeUser;

    next();
  } catch (error) {
    next(error);
  }
};

export const authenticate = createAuthenticate();

/** Attach a validated user when a bearer token is supplied; keep public reads public. */
export const optionalAuthenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return next();
  return authenticate(req, res, next);
};

export const assertActiveAccount = (user) => {
  if (user?.status !== "ACTIVE") {
    const status = user?.status || "unavailable";
    throw new AppError(`Account is ${status.toLowerCase()}.`, HTTP_STATUS.FORBIDDEN);
  }
};

// Role-based Access Control (RBAC) middleware
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(
        new AppError("Authentication required.", HTTP_STATUS.UNAUTHORIZED)
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied. Requires one of the following roles: ${allowedRoles.join(", ")}`,
          HTTP_STATUS.FORBIDDEN
        )
      );
    }

    next();
  };
};

/**
 * Middleware requiring user to be an approved cook
 */
export const requireApprovedCook = (req, res, next) => {
  if (!req.user) {
    return next(new AppError("Authentication required.", HTTP_STATUS.UNAUTHORIZED));
  }

  const isApprovedCook =
    req.user.status === "ACTIVE" &&
    req.user.activePortal === "COOK" &&
    req.user.cookProfile?.verificationStatus === "APPROVED";

  if (!isApprovedCook) {
    return next(
      new AppError(
        "Access denied. Only approved cooks can access this resource.",
        HTTP_STATUS.FORBIDDEN
      )
    );
  }

  next();
};

/** Middleware requiring an active user with an approved delivery-agent profile. */
export const requireApprovedDeliveryAgent = (req, res, next) => {
  if (!req.user) {
    return next(new AppError("Authentication required.", HTTP_STATUS.UNAUTHORIZED));
  }

  const isApprovedDeliveryAgent =
    req.user.status === "ACTIVE" &&
    req.user.activePortal === "DELIVERY_AGENT" &&
    req.user.deliveryAgent?.verificationStatus === "APPROVED";

  if (!isApprovedDeliveryAgent) {
    return next(
      new AppError(
        "Access denied. Only approved delivery agents can access this resource.",
        HTTP_STATUS.FORBIDDEN
      )
    );
  }

  next();
};
