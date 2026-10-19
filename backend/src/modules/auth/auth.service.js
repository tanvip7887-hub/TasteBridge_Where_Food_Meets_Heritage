import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../../config/prisma.js";
import env from "../../config/env.js";
import { sendEmailJob } from "../../services/email.service.js";
import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { getAvailablePortals, resolveActivePortal, serializePortalUser } from "./portal-access.js";

// Helper to remove passwordHash from user object
export const sanitizeUser = (user, activePortal) => serializePortalUser(user, activePortal);

// Generate JWT token
export const generateToken = (userId, role, activePortal = role) => {
  const secret = env.JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new AppError("JWT secret is not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
  return jwt.sign({ userId, role, activePortal }, secret, {
    expiresIn: env.JWT_EXPIRES_IN || process.env.JWT_EXPIRES_IN || "7d",
  });
};

// Helper: Generate secure 6-digit numeric OTP
const generateNumericOtp = () => {
  return crypto.randomInt(100000, 999999).toString();
};

const OTP_ATTEMPT_LIMIT = 5;
const OTP_UNAVAILABLE_MESSAGE = "The verification code is invalid or unavailable. Request a new code and try again.";
const publicOtpError = (statusCode = HTTP_STATUS.BAD_REQUEST, retryAfterSeconds = null, message = OTP_UNAVAILABLE_MESSAGE) => {
  const error = new AppError(message, statusCode, null, retryAfterSeconds);
  error.suppressStackTrace = true;
  return error;
};

export const registerUser = async ({ name, email, phone, password }, {
  database = prisma,
  emailSender = sendEmailJob,
  now = Date.now,
} = {}) => {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Check for duplicate email in verified Users table
  const existingEmail = await database.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existingEmail) {
    return { email: normalizedEmail, expiresIn: 600 };
  }

  // 2. Check for duplicate phone if provided
  if (phone) {
    const existingPhone = await database.user.findUnique({
      where: { phone },
    });
    if (existingPhone) {
      return { email: normalizedEmail, expiresIn: 600 };
    }
  }

  // 3. Generate 6-digit numeric OTP & hashes
  const rawOtp = generateNumericOtp();
  const passwordHash = await bcrypt.hash(password, 10);
  const otpHash = await bcrypt.hash(rawOtp, 10);
  const expiresAt = new Date(now() + 10 * 60 * 1000); // 10 minutes expiry
  const resendAllowedAt = new Date(now() + 60 * 1000); // 60 seconds cooldown

  // 4. Store or overwrite PendingRegistration
  await database.pendingRegistration.upsert({
    where: { email: normalizedEmail },
    update: {
      name,
      phone: phone || null,
      passwordHash,
      otpHash,
      expiresAt,
      attempts: 0,
      resendAllowedAt,
    },
    create: {
      email: normalizedEmail,
      name,
      phone: phone || null,
      passwordHash,
      otpHash,
      expiresAt,
      attempts: 0,
      resendAllowedAt,
    },
  });

  // 5. Send verification email directly via email service
  try {
    await emailSender({
      type: "EMAIL_OTP",
      to: normalizedEmail,
      name,
      otp: rawOtp,
      expiresInMinutes: 10,
    });
  } catch (error) {
    throw new AppError(
      error.message || "Failed to send verification email. Email service is currently unavailable.",
      HTTP_STATUS.SERVICE_UNAVAILABLE
    );
  }

  return {
    email: normalizedEmail,
    expiresIn: 600,
  };
};

export const verifyRegisterOtp = async ({ email, otp }, { database = prisma, now = () => new Date() } = {}) => {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Find PendingRegistration
  const pending = await database.pendingRegistration.findUnique({
    where: { email: normalizedEmail },
  });

  if (!pending) {
    throw publicOtpError();
  }

  // 2. Check expiration
  if (pending.expiresAt < now()) {
    await database.pendingRegistration.delete({ where: { email: normalizedEmail } });
    throw publicOtpError();
  }

  // 3. Check attempts limit
  if (pending.attempts >= OTP_ATTEMPT_LIMIT) {
    await database.pendingRegistration.delete({ where: { email: normalizedEmail } });
    throw publicOtpError();
  }

  // 4. Verify OTP hash
  const isValid = await bcrypt.compare(otp, pending.otpHash);
  if (!isValid) {
    const updatedAttempts = pending.attempts + 1;
    if (updatedAttempts >= OTP_ATTEMPT_LIMIT) {
      await database.pendingRegistration.delete({ where: { email: normalizedEmail } });
      throw publicOtpError();
    } else {
      await database.pendingRegistration.update({
        where: { email: normalizedEmail },
        data: { attempts: updatedAttempts },
      });
      throw publicOtpError();
    }
  }

  // 5. Atomic Transaction: Create User + Remove PendingRegistration
  const user = await database.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        name: pending.name,
        email: pending.email,
        phone: pending.phone,
        passwordHash: pending.passwordHash,
        role: "CUSTOMER", // Forced CUSTOMER role
        status: "ACTIVE",
      },
    });

    await tx.pendingRegistration.delete({
      where: { email: normalizedEmail },
    });

    return createdUser;
  });

  // 6. Generate JWT token
  const activePortal = resolveActivePortal(user, user.role);
  const token = generateToken(user.id, user.role, activePortal);

  return {
    token,
    user: sanitizeUser(user),
  };
};

export const resendRegisterOtp = async ({ email }, {
  database = prisma,
  emailSender = sendEmailJob,
  now = () => new Date(),
} = {}) => {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Find PendingRegistration
  const pending = await database.pendingRegistration.findUnique({
    where: { email: normalizedEmail },
  });

  if (!pending) {
    return { email: normalizedEmail, expiresIn: 600 };
  }

  // 2. Enforce resend cooldown
  const currentTime = now();
  if (pending.resendAllowedAt && pending.resendAllowedAt > currentTime) {
    const secondsLeft = Math.max(1, Math.ceil((pending.resendAllowedAt.getTime() - currentTime.getTime()) / 1000));
    throw publicOtpError(429, secondsLeft, "Please wait before requesting another verification code.");
  }

  // 3. Generate new 6-digit OTP & hashes
  const rawOtp = generateNumericOtp();
  const otpHash = await bcrypt.hash(rawOtp, 10);
  const expiresAt = new Date(currentTime.getTime() + 10 * 60 * 1000); // 10 minutes expiry
  const resendAllowedAt = new Date(currentTime.getTime() + 60 * 1000); // 60 seconds cooldown

  // 4. Update PendingRegistration
  await database.pendingRegistration.update({
    where: { email: normalizedEmail },
    data: {
      otpHash,
      expiresAt,
      attempts: 0,
      resendAllowedAt,
    },
  });

  // 5. Send verification email directly via email service
  try {
    await emailSender({
      type: "EMAIL_OTP",
      to: normalizedEmail,
      name: pending.name,
      otp: rawOtp,
      expiresInMinutes: 10,
    });
  } catch (error) {
    throw new AppError(
      error.message || "Failed to send verification email. Email service is currently unavailable.",
      HTTP_STATUS.SERVICE_UNAVAILABLE
    );
  }

  return {
    email: normalizedEmail,
    expiresIn: 600,
  };
};

export const loginUser = async ({ email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Find user by email
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
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
    throw new AppError("Invalid email or password", HTTP_STATUS.UNAUTHORIZED);
  }

  // 2. Compare password
  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new AppError("Invalid email or password", HTTP_STATUS.UNAUTHORIZED);
  }

  // 3. Check account status
  if (user.status === "SUSPENDED" || user.status === "DEACTIVATED") {
    throw new AppError(
      `Account is ${user.status.toLowerCase()}. Please contact support.`,
      HTTP_STATUS.FORBIDDEN
    );
  }

  // 4. Generate token
  const activePortal = resolveActivePortal(user, user.role);
  const token = generateToken(user.id, user.role, activePortal);

  return {
    token,
    user: sanitizeUser(user, activePortal),
  };
};

export const createPortalSwitchService = (database) => async (userId, requestedPortal) => {
  const user = await database.user.findUnique({
    where: { id: userId },
    include: {
      cookProfile: { select: { id: true, businessName: true, profileImage: true, isOpen: true, verificationStatus: true, isApprovedToSell: true } },
      deliveryAgent: { select: { id: true, verificationStatus: true, isAvailable: true } },
    },
  });
  if (!user) throw new AppError("User not found.", HTTP_STATUS.NOT_FOUND);
  if (user.status !== "ACTIVE") throw new AppError("Account is not active.", HTTP_STATUS.FORBIDDEN);
  if (!getAvailablePortals(user).includes(requestedPortal)) {
    throw new AppError("This portal is unavailable until its account and approval requirements are met.", HTTP_STATUS.FORBIDDEN);
  }
  return { token: generateToken(user.id, user.role, requestedPortal), user: sanitizeUser(user, requestedPortal) };
};

export const switchActivePortal = createPortalSwitchService(prisma);

export const getUserById = async (userId, activePortal) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
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
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
  }

  if (user.status === "SUSPENDED" || user.status === "DEACTIVATED") {
    throw new AppError(
      `Account is ${user.status.toLowerCase()}`,
      HTTP_STATUS.FORBIDDEN
    );
  }

  return sanitizeUser(user, activePortal);
};

export const forgotPassword = async ({ email }, {
  database = prisma,
  emailSender = sendEmailJob,
  now = Date.now,
} = {}) => {
  const normalizedEmail = email.toLowerCase().trim();
  const genericResponse = {
    email: normalizedEmail,
    message: "If an account exists with this email, a password reset verification code has been sent.",
  };

  // 1. Find user by email
  const user = await database.user.findUnique({
    where: { email: normalizedEmail },
  });

  // Security Rule: Do not reveal whether email exists
  if (!user) {
    return genericResponse;
  }

  // 2. Generate 6-digit numeric OTP & hashes
  const rawOtp = crypto.randomInt(100000, 999999).toString();
  const otpHash = await bcrypt.hash(rawOtp, 10);
  const expiresAt = new Date(now() + 10 * 60 * 1000); // 10 minutes expiry
  const resendAllowedAt = new Date(now() + 60 * 1000); // 60 seconds cooldown

  // 3. Upsert PasswordResetToken record for this email
  await database.passwordResetToken.upsert({
    where: { email: normalizedEmail },
    update: {
      userId: user.id,
      otpHash,
      resetTokenHash: null,
      expiresAt,
      attempts: 0,
      usedAt: null,
      resendAllowedAt,
    },
    create: {
      userId: user.id,
      email: normalizedEmail,
      otpHash,
      expiresAt,
      attempts: 0,
      resendAllowedAt,
    },
  });

  // 4. Send password reset email directly via email service
  try {
    await emailSender({
      type: "PASSWORD_RESET_OTP",
      to: normalizedEmail,
      name: user.name,
      otp: rawOtp,
      expiresInMinutes: 10,
    });
  } catch (error) {
    // Return generic response without failing user flow
  }

  return genericResponse;
};

export const verifyResetOtp = async ({ email, otp }, { database = prisma, now = () => new Date() } = {}) => {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Find PasswordResetToken
  const record = await database.passwordResetToken.findUnique({
    where: { email: normalizedEmail },
  });

  if (!record) {
    throw publicOtpError();
  }

  // 2. Check expiration
  if (record.expiresAt < now()) {
    await database.passwordResetToken.delete({ where: { email: normalizedEmail } });
    throw publicOtpError();
  }

  // 3. Check attempts limit
  if (record.attempts >= OTP_ATTEMPT_LIMIT) {
    await database.passwordResetToken.delete({ where: { email: normalizedEmail } });
    throw publicOtpError();
  }

  // 4. Verify OTP hash
  const isValid = await bcrypt.compare(otp, record.otpHash);
  if (!isValid) {
    const updatedAttempts = record.attempts + 1;
    if (updatedAttempts >= OTP_ATTEMPT_LIMIT) {
      await database.passwordResetToken.delete({ where: { email: normalizedEmail } });
      throw publicOtpError();
    } else {
      await database.passwordResetToken.update({
        where: { email: normalizedEmail },
        data: { attempts: updatedAttempts },
      });
      throw publicOtpError();
    }
  }

  // 5. Generate temporary reset token for step 3 (Password Reset Form)
  const rawResetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenHash = crypto.createHash("sha256").update(rawResetToken).digest("hex");

  await database.passwordResetToken.update({
    where: { email: normalizedEmail },
    data: {
      resetTokenHash,
      attempts: 0,
    },
  });

  return {
    email: normalizedEmail,
    resetToken: rawResetToken,
    message: "Code verified successfully.",
  };
};

export const resetPassword = async ({ email, resetToken, password, confirmPassword }) => {
  if (password !== confirmPassword) {
    throw new AppError("Passwords do not match", HTTP_STATUS.BAD_REQUEST);
  }

  const normalizedEmail = email ? email.toLowerCase().trim() : "";
  if (!normalizedEmail || !resetToken) {
    throw new AppError(
      "Invalid password reset session. Please request a code again.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({
    where: { email: normalizedEmail },
  });

  if (!record || record.resetTokenHash !== resetTokenHash || record.expiresAt < new Date()) {
    throw new AppError(
      "Password reset session has expired or is invalid. Please request a code again.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const newPasswordHash = await bcrypt.hash(password, 10);

  // Transactionally update password and remove reset token
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: newPasswordHash },
    }),
    prisma.passwordResetToken.delete({
      where: { email: normalizedEmail },
    }),
  ]);

  return { message: "Password reset successfully." };
};
