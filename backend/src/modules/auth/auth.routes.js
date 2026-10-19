import { Router } from "express";
import {
  register,
  verifyOtp,
  resendOtp,
  login,
  getMe,
  switchPortal,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
} from "./auth.controller.js";
import {
  registerSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  verifyResetOtpSchema,
  resetPasswordSchema,
  switchPortalSchema,
} from "./auth.validation.js";
import { validate } from "../../middlewares/validate.js";
import { authenticate } from "../../middlewares/auth.js";
import { authRateLimiters } from "../../middlewares/authRateLimit.js";

const router = Router();

router.post("/register", validate(registerSchema), authRateLimiters.register, register);
router.post(
  "/register/verify-otp",
  validate(verifyOtpSchema),
  authRateLimiters.registrationVerify,
  verifyOtp
);
router.post("/verify-otp", validate(verifyOtpSchema), authRateLimiters.registrationVerify, verifyOtp);
router.post(
  "/register/resend-otp",
  validate(resendOtpSchema),
  authRateLimiters.registrationResend,
  resendOtp
);
router.post("/resend-otp", validate(resendOtpSchema), authRateLimiters.registrationResend, resendOtp);
router.post("/login", validate(loginSchema), authRateLimiters.login, login);
router.get("/me", authenticate, getMe);
router.post("/switch-portal", authenticate, validate(switchPortalSchema), switchPortal);

// Password Reset Routes (Publicly accessible)
router.post(
  "/forgot-password",
  validate(forgotPasswordSchema),
  authRateLimiters.passwordResetRequest,
  forgotPassword
);
router.post(
  "/verify-reset-otp",
  validate(verifyResetOtpSchema),
  authRateLimiters.passwordResetVerify,
  verifyResetOtp
);
router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  authRateLimiters.passwordResetComplete,
  resetPassword
);

export default router;
