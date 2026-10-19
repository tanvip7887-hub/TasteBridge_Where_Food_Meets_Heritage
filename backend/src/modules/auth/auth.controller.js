import {
  registerUser,
  verifyRegisterOtp,
  resendRegisterOtp,
  loginUser,
  getUserById,
  forgotPassword as forgotPasswordService,
  verifyResetOtp as verifyResetOtpService,
  resetPassword as resetPasswordService,
  switchActivePortal,
} from "./auth.service.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { HTTP_STATUS } from "../../constants/index.js";

export const register = async (req, res, next) => {
  try {
    const result = await registerUser(req.body);
    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      "If the supplied details are eligible for registration, verification instructions will be sent to the supplied email. They may take a few minutes to arrive; check your Inbox and Spam/Junk folders.",
      result
    );
  } catch (error) {
    next(error);
  }
};

export const verifyOtp = async (req, res, next) => {
  try {
    const result = await verifyRegisterOtp(req.body);
    return sendSuccess(
      res,
      HTTP_STATUS.CREATED,
      "Account created successfully.",
      result
    );
  } catch (error) {
    next(error);
  }
};

export const resendOtp = async (req, res, next) => {
  try {
    const result = await resendRegisterOtp(req.body);
    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      "If a pending registration exists, a new verification code has been requested for the supplied email.",
      result
    );
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await loginUser(req.body);
    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      "Login successful",
      result
    );
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await getUserById(req.user.id, req.user.activePortal);
    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      "Current user profile retrieved",
      user
    );
  } catch (error) {
    next(error);
  }
};

export const switchPortal = async (req, res, next) => {
  try {
    const result = await switchActivePortal(req.user.id, req.body.portal);
    return sendSuccess(res, HTTP_STATUS.OK, "Portal switched successfully.", result);
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const result = await forgotPasswordService(req.body);
    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      result.message,
      result
    );
  } catch (error) {
    next(error);
  }
};

export const verifyResetOtp = async (req, res, next) => {
  try {
    const result = await verifyResetOtpService(req.body);
    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      result.message,
      result
    );
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const result = await resetPasswordService(req.body);
    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      result.message,
      null
    );
  } catch (error) {
    next(error);
  }
};
