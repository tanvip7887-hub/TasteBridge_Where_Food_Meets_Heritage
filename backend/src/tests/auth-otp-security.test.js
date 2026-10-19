import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import test from "node:test";
import {
  forgotPassword,
  registerUser,
  resendRegisterOtp,
  verifyRegisterOtp,
  verifyResetOtp,
} from "../modules/auth/auth.service.js";
import { errorHandler } from "../middlewares/errorHandler.js";

const validUntil = new Date("2030-01-01T00:00:00.000Z");
const fixedNow = () => new Date("2026-10-17T12:00:00.000Z");

const makeDatabase = ({ user = null, pendingRegistration = null, passwordResetToken = null } = {}) => {
  const state = { user, pendingRegistration, passwordResetToken };
  const database = {
    user: {
      findUnique: async ({ where }) => {
        if (where.email) return state.user?.email === where.email ? state.user : null;
        if (where.phone) return state.user?.phone === where.phone ? state.user : null;
        return null;
      },
    },
    pendingRegistration: {
      findUnique: async () => state.pendingRegistration,
      upsert: async ({ create }) => { state.pendingRegistration = create; return create; },
      update: async ({ data }) => { state.pendingRegistration = { ...state.pendingRegistration, ...data }; return state.pendingRegistration; },
      delete: async () => { const prior = state.pendingRegistration; state.pendingRegistration = null; return prior; },
    },
    passwordResetToken: {
      findUnique: async () => state.passwordResetToken,
      upsert: async ({ create, update }) => {
        state.passwordResetToken = state.passwordResetToken ? { ...state.passwordResetToken, ...update } : create;
        return state.passwordResetToken;
      },
      update: async ({ data }) => { state.passwordResetToken = { ...state.passwordResetToken, ...data }; return state.passwordResetToken; },
      delete: async () => { const prior = state.passwordResetToken; state.passwordResetToken = null; return prior; },
    },
    $transaction: async (callback) => callback({
      user: {
        create: async ({ data }) => {
          state.user = { id: "customer-1", status: "ACTIVE", ...data };
          return state.user;
        },
      },
      pendingRegistration: {
        delete: async () => { const prior = state.pendingRegistration; state.pendingRegistration = null; return prior; },
      },
    }),
  };
  return { database, state };
};

const getAppError = async (promise) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("Expected operation to reject");
};

test("registration responses do not distinguish a verified account from an eligible new registration", async () => {
  let emailAttempts = 0;
  const existing = makeDatabase({ user: { id: "existing", email: "person@example.com", status: "ACTIVE" } });
  const available = makeDatabase();
  const emailSender = async () => { emailAttempts += 1; };
  const existingResponse = await registerUser({ name: "Person", email: "person@example.com", password: "secret1" }, {
    database: existing.database,
    emailSender,
  });
  const availableResponse = await registerUser({ name: "Person", email: "person@example.com", password: "secret1" }, {
    database: available.database,
    emailSender,
  });

  assert.deepEqual(existingResponse, availableResponse);
  assert.equal(emailAttempts, 1);

  const phoneConflict = makeDatabase({ user: { id: "existing-phone", email: "other@example.com", phone: "+15551234567" } });
  const phoneConflictResponse = await registerUser({
    name: "Person", email: "person@example.com", phone: "+15551234567", password: "secret1",
  }, { database: phoneConflict.database, emailSender });
  assert.deepEqual(phoneConflictResponse, availableResponse);
  assert.equal(emailAttempts, 1);
});

test("registration OTP missing, expired, incorrect, and exhausted requests have the same public error", async () => {
  const missing = makeDatabase();
  const expired = makeDatabase({ pendingRegistration: {
    expiresAt: new Date(fixedNow().getTime() - 1), attempts: 0, otpHash: await bcrypt.hash("123456", 4),
  } });
  const incorrect = makeDatabase({ pendingRegistration: {
    expiresAt: validUntil, attempts: 1, otpHash: await bcrypt.hash("123456", 4),
  } });
  const exhausted = makeDatabase({ pendingRegistration: {
    expiresAt: validUntil, attempts: 5, otpHash: await bcrypt.hash("123456", 4),
  } });
  const errors = await Promise.all([
    getAppError(verifyRegisterOtp({ email: "person@example.com", otp: "000000" }, { database: missing.database, now: fixedNow })),
    getAppError(verifyRegisterOtp({ email: "person@example.com", otp: "000000" }, { database: expired.database, now: fixedNow })),
    getAppError(verifyRegisterOtp({ email: "person@example.com", otp: "000000" }, { database: incorrect.database, now: fixedNow })),
    getAppError(verifyRegisterOtp({ email: "person@example.com", otp: "000000" }, { database: exhausted.database, now: fixedNow })),
  ]);

  assert.deepEqual(errors.map(({ statusCode, message }) => ({ statusCode, message })), Array(4).fill({
    statusCode: 400,
    message: "The verification code is invalid or unavailable. Request a new code and try again.",
  }));
  assert.equal(expired.state.pendingRegistration, null);
  assert.equal(exhausted.state.pendingRegistration, null);
  assert.equal(incorrect.state.pendingRegistration.attempts, 2);
});

test("registration resend hides missing pending requests and cooldown includes exact Retry-After", async () => {
  const missing = makeDatabase();
  let emailAttempts = 0;
  const emailSender = async () => { emailAttempts += 1; };
  const missingResponse = await resendRegisterOtp({ email: "person@example.com" }, {
    database: missing.database,
    emailSender,
    now: fixedNow,
  });
  const cooldown = makeDatabase({ pendingRegistration: {
    name: "Person",
    resendAllowedAt: new Date(fixedNow().getTime() + 12_001),
  } });
  const cooldownError = await getAppError(resendRegisterOtp({ email: "person@example.com" }, {
    database: cooldown.database,
    emailSender,
    now: fixedNow,
  }));
  const ready = makeDatabase({ pendingRegistration: {
    name: "Person",
    attempts: 4,
    resendAllowedAt: new Date(fixedNow().getTime() - 1),
  } });
  const readyResponse = await resendRegisterOtp({ email: "person@example.com" }, {
    database: ready.database,
    emailSender,
    now: fixedNow,
  });

  assert.deepEqual(missingResponse, { email: "person@example.com", expiresIn: 600 });
  assert.deepEqual(readyResponse, missingResponse);
  assert.equal(cooldownError.statusCode, 429);
  assert.equal(cooldownError.retryAfterSeconds, 13);
  assert.equal(cooldownError.message, "Please wait before requesting another verification code.");
  assert.equal(emailAttempts, 1);
  assert.equal(ready.state.pendingRegistration.attempts, 0);

  const headers = {};
  let errorStatus;
  let errorBody;
  const originalError = console.error;
  const originalNodeEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  console.error = () => {};
  try {
    errorHandler(cooldownError, { method: "POST", path: "/api/v1/auth/resend-otp" }, {
      setHeader(name, value) { headers[name] = value; return this; },
      status(value) { errorStatus = value; return this; },
      json(value) { errorBody = value; return this; },
    }, () => {});
  } finally {
    console.error = originalError;
    if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnvironment;
  }
  assert.equal(errorStatus, 429);
  assert.equal(headers["Retry-After"], "13");
  assert.equal(errorBody.message, "Please wait before requesting another verification code.");
  assert.equal(errorBody.message.includes("13"), false);
  assert.equal("stack" in errorBody, false);
});

test("forgot-password initiation has the same response for existing and missing accounts", async () => {
  const sent = [];
  const emailSender = async (message) => { sent.push(message.type); };
  const existing = makeDatabase({ user: { id: "customer-1", email: "person@example.com", name: "Person" } });
  const missing = makeDatabase();
  const existingResponse = await forgotPassword({ email: "person@example.com" }, {
    database: existing.database,
    emailSender,
    now: () => fixedNow().getTime(),
  });
  const missingResponse = await forgotPassword({ email: "person@example.com" }, {
    database: missing.database,
    emailSender,
    now: () => fixedNow().getTime(),
  });

  assert.deepEqual(existingResponse, missingResponse);
  assert.equal(existingResponse.message, "If an account exists with this email, a password reset verification code has been sent.");
  assert.deepEqual(sent, ["PASSWORD_RESET_OTP"]);
});

test("reset OTP missing, expired, incorrect, and exhausted requests have the same public error", async () => {
  const hash = await bcrypt.hash("123456", 4);
  const missing = makeDatabase();
  const expired = makeDatabase({ passwordResetToken: { expiresAt: new Date(fixedNow().getTime() - 1), attempts: 0, otpHash: hash } });
  const incorrect = makeDatabase({ passwordResetToken: { expiresAt: validUntil, attempts: 1, otpHash: hash } });
  const exhausted = makeDatabase({ passwordResetToken: { expiresAt: validUntil, attempts: 5, otpHash: hash } });
  const errors = await Promise.all([
    getAppError(verifyResetOtp({ email: "person@example.com", otp: "000000" }, { database: missing.database, now: fixedNow })),
    getAppError(verifyResetOtp({ email: "person@example.com", otp: "000000" }, { database: expired.database, now: fixedNow })),
    getAppError(verifyResetOtp({ email: "person@example.com", otp: "000000" }, { database: incorrect.database, now: fixedNow })),
    getAppError(verifyResetOtp({ email: "person@example.com", otp: "000000" }, { database: exhausted.database, now: fixedNow })),
  ]);

  assert.deepEqual(errors.map(({ statusCode, message }) => ({ statusCode, message })), Array(4).fill({
    statusCode: 400,
    message: "The verification code is invalid or unavailable. Request a new code and try again.",
  }));
  assert.equal(expired.state.passwordResetToken, null);
  assert.equal(exhausted.state.passwordResetToken, null);
  assert.equal(incorrect.state.passwordResetToken.attempts, 2);
});

test("legitimate registration and password reset OTP verification still succeed", async () => {
  const registration = makeDatabase();
  let registrationOtp;
  await registerUser({ name: "Person", email: "person@example.com", password: "secret1" }, {
    database: registration.database,
    emailSender: async ({ otp }) => { registrationOtp = otp; },
    now: () => fixedNow().getTime(),
  });
  const registered = await verifyRegisterOtp({ email: "person@example.com", otp: registrationOtp }, {
    database: registration.database,
    now: fixedNow,
  });
  assert.equal(registered.user.email, "person@example.com");
  assert.equal(registration.state.pendingRegistration, null);

  const reset = makeDatabase({ passwordResetToken: {
    email: "person@example.com",
    userId: "customer-1",
    otpHash: await bcrypt.hash("654321", 4),
    expiresAt: validUntil,
    attempts: 0,
  } });
  const verified = await verifyResetOtp({ email: "person@example.com", otp: "654321" }, {
    database: reset.database,
    now: fixedNow,
  });
  assert.equal(verified.email, "person@example.com");
  assert.ok(verified.resetToken);
  assert.equal(reset.state.passwordResetToken.attempts, 0);
  assert.ok(reset.state.passwordResetToken.resetTokenHash);
});
