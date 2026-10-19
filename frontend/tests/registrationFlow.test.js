import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import authReducer, {
  registerUser,
  verifyRegisterOtp,
} from "../src/store/slices/authSlice.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("registration request keeps the public route mounted and does not authenticate before OTP", () => {
  let state = authReducer(undefined, { type: "test/init" });
  state = authReducer(state, registerUser.pending("register-request"));

  assert.equal(state.registrationLoading, true);
  assert.equal(state.loading, false, "route-level loading is reserved for session restoration");
  assert.equal(state.isAuthenticated, false);

  state = authReducer(state, registerUser.fulfilled(
    { email: "new-user@example.test", expiresIn: 600 },
    "register-request",
  ));

  assert.equal(state.registrationLoading, false);
  assert.equal(state.isAuthenticated, false);
  assert.equal(state.token, null);
});

test("registration API errors end the form request and retain an error without starting portal selection", async () => {
  let state = authReducer(undefined, { type: "test/init" });
  state = authReducer(state, registerUser.pending("register-request"));
  state = authReducer(state, registerUser.rejected(
    null,
    "register-request",
    { email: "new-user@example.test" },
    { status: 503, message: "Verification email could not be sent." },
  ));

  assert.equal(state.registrationLoading, false);
  assert.equal(state.loading, false);
  assert.equal(state.isAuthenticated, false);
  assert.equal(state.error.message, "Verification email could not be sent.");

  const [registerForm, routes] = await Promise.all([
    read("../src/components/auth/RegisterForm.jsx"),
    read("../src/routes/ActivePortalRoute.jsx"),
  ]);
  assert.match(registerForm, /setServerError\(err\?\.message \|\| "Registration failed/);
  assert.match(routes, /!isAuthenticated \|\| user\?\.activePortal === portal/);
});

test("OTP screen tells users the email was submitted and to check Spam/Junk without promising delivery", async () => {
  const otpForm = await read("../src/components/auth/OtpVerificationForm.jsx");
  assert.match(otpForm, /submitted successfully to your email provider/);
  assert.match(otpForm, /Spam\/Junk folders/);
  assert.match(otpForm, /A new verification email was submitted to your email provider/);
  assert.doesNotMatch(otpForm, /We've sent a 6-digit verification code to/);
});

test("invalid OTP ends request loading without authenticating or losing the OTP flow", async () => {
  let state = authReducer(undefined, { type: "test/init" });
  state = authReducer(state, verifyRegisterOtp.pending("verify-request"));
  assert.equal(state.otpVerificationLoading, true);
  assert.equal(state.loading, false);

  state = authReducer(state, verifyRegisterOtp.rejected(
    null,
    "verify-request",
    { email: "new-user@example.test", otp: "000000" },
    { status: 400, message: "Invalid verification code." },
  ));

  assert.equal(state.otpVerificationLoading, false);
  assert.equal(state.isAuthenticated, false);
  assert.equal(state.token, null);

  const [registerForm, otpForm, portalRoute] = await Promise.all([
    read("../src/components/auth/RegisterForm.jsx"),
    read("../src/components/auth/OtpVerificationForm.jsx"),
    read("../src/routes/ActivePortalRoute.jsx"),
  ]);
  assert.match(registerForm, /if \(pendingEmail\)[\s\S]*<OtpVerificationForm/);
  assert.match(registerForm, /registrationLoading/);
  assert.match(otpForm, /setErrorMsg\([\s\S]*Invalid or expired verification code/);
  assert.match(portalRoute, /if \(!isInitialized \|\| loading \|\| switching\)/);
});

test("only successful OTP verification creates the authenticated session", () => {
  let state = authReducer(undefined, { type: "test/init" });
  state = authReducer(state, verifyRegisterOtp.pending("verify-request"));
  assert.equal(state.isAuthenticated, false);

  const user = { id: "verified-user", role: "CUSTOMER", activePortal: "CUSTOMER" };
  state = authReducer(state, verifyRegisterOtp.fulfilled(
    { token: "verified-session-token", user },
    "verify-request",
    { email: "new-user@example.test", otp: "123456" },
  ));

  assert.equal(state.otpVerificationLoading, false);
  assert.equal(state.isAuthenticated, true);
  assert.equal(state.user, user);
  assert.equal(state.token, "verified-session-token");
});
