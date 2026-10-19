import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";
import {
  authRateLimiters,
  createAuthIngressRateLimiter,
  createAuthRateLimiter,
  createMemoryRateLimitStore,
} from "../middlewares/authRateLimit.js";
import authRouter from "../modules/auth/auth.routes.js";
import { validate } from "../middlewares/validate.js";
import { loginSchema } from "../modules/auth/auth.validation.js";

const invoke = (middleware, { ip = "127.0.0.1", email, forwardedFor } = {}) => {
  const result = { nextCalls: 0, status: null, headers: {}, body: null };
  const req = {
    socket: { remoteAddress: ip },
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
    body: email ? { email } : {},
  };
  const res = {
    setHeader(name, value) { result.headers[name] = value; return this; },
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; },
  };
  middleware(req, res, () => { result.nextCalls += 1; });
  return result;
};

const invokeIngress = (middleware, { ip = "127.0.0.1", path = "/login", method = "POST" } = {}) => {
  const result = { nextCalls: 0, status: null, headers: {}, body: null };
  const req = { method, path, socket: { remoteAddress: ip } };
  const res = {
    setHeader(name, value) { result.headers[name] = value; return this; },
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; },
  };
  middleware(req, res, () => { result.nextCalls += 1; });
  return result;
};

test("auth limiter allows requests within both limits", () => {
  const limiter = createAuthRateLimiter({
    name: "test-login", ipLimit: 2, accountLimit: 2,
    store: createMemoryRateLimitStore(),
  });
  assert.equal(invoke(limiter, { email: "person@example.com" }).nextCalls, 1);
  assert.equal(invoke(limiter, { email: "person@example.com" }).nextCalls, 1);
});

test("exceeded limit returns consistent 429 and Retry-After", () => {
  let now = 1_000;
  const limiter = createAuthRateLimiter({
    name: "test-login", ipLimit: 2, accountLimit: 1, windowMs: 60_000,
    store: createMemoryRateLimitStore({ now: () => now }),
  });
  invoke(limiter, { email: "person@example.com" });
  const blocked = invoke(limiter, { email: "person@example.com" });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers["Retry-After"], "60");
  assert.deepEqual(blocked.body, {
    success: false,
    message: "Too many authentication requests. Please wait before trying again.",
  });
});

test("Retry-After waits for the latest exhausted IP or account window", () => {
  let now = 0;
  const limiter = createAuthRateLimiter({
    name: "test-retry-window", ipLimit: 3, accountLimit: 1, windowMs: 900_000,
    store: createMemoryRateLimitStore({ now: () => now }),
  });
  invoke(limiter, { ip: "192.0.2.50", email: "victim@example.com" });
  now = 30_000;
  invoke(limiter, { ip: "192.0.2.51", email: "other-1@example.com" });
  invoke(limiter, { ip: "192.0.2.51", email: "other-2@example.com" });
  const blocked = invoke(limiter, { ip: "192.0.2.51", email: "victim@example.com" });

  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers["Retry-After"], "900");
});

test("fixed windows recover automatically after expiry", () => {
  let now = 0;
  const limiter = createAuthRateLimiter({
    name: "test-login", ipLimit: 1, accountLimit: 1, windowMs: 1_000,
    store: createMemoryRateLimitStore({ now: () => now }),
  });
  invoke(limiter, { email: "person@example.com" });
  assert.equal(invoke(limiter, { email: "person@example.com" }).status, 429);
  now = 1_000;
  assert.equal(invoke(limiter, { email: "person@example.com" }).nextCalls, 1);
});

test("account limits are independent and forwarded IP headers are ignored", () => {
  const limiter = createAuthRateLimiter({
    name: "test-login", ipLimit: 5, accountLimit: 1, windowMs: 60_000,
    store: createMemoryRateLimitStore(),
  });
  invoke(limiter, { ip: "192.0.2.1", email: "first@example.com", forwardedFor: "203.0.113.1" });
  const sameAccountDifferentSocket = invoke(limiter, {
    ip: "192.0.2.2", email: "first@example.com", forwardedFor: "198.51.100.2",
  });
  const differentAccountSameSocket = invoke(limiter, {
    ip: "192.0.2.1", email: "second@example.com", forwardedFor: "203.0.113.1",
  });
  assert.equal(sameAccountDifferentSocket.status, 429);
  assert.equal(differentAccountSameSocket.nextCalls, 1);
});

test("registration OTP aliases share the same limiter instances", () => {
  const routeByPath = new Map(authRouter.stack.map((layer) => [layer.route?.path, layer.route]));
  const getLimiter = (path) => routeByPath.get(path).stack[1].handle;
  assert.equal(getLimiter("/register/verify-otp"), authRateLimiters.registrationVerify);
  assert.equal(getLimiter("/verify-otp"), authRateLimiters.registrationVerify);
  assert.equal(getLimiter("/register/resend-otp"), authRateLimiters.registrationResend);
  assert.equal(getLimiter("/resend-otp"), authRateLimiters.registrationResend);
});

test("every public credential and OTP endpoint is throttled", () => {
  const routes = new Map(authRouter.stack.map((layer) => [layer.route?.path, layer.route]));
  const expected = new Map([
    ["/register", authRateLimiters.register],
    ["/register/verify-otp", authRateLimiters.registrationVerify],
    ["/verify-otp", authRateLimiters.registrationVerify],
    ["/register/resend-otp", authRateLimiters.registrationResend],
    ["/resend-otp", authRateLimiters.registrationResend],
    ["/login", authRateLimiters.login],
    ["/forgot-password", authRateLimiters.passwordResetRequest],
    ["/verify-reset-otp", authRateLimiters.passwordResetVerify],
    ["/reset-password", authRateLimiters.passwordResetComplete],
  ]);
  for (const [path, limiter] of expected) {
    assert.ok(routes.get(path).stack.some((layer) => layer.handle === limiter), `${path} must be throttled`);
  }
  assert.equal(routes.get("/me").stack.some((layer) => Object.values(authRateLimiters).includes(layer.handle)), false);
});

test("IP limit uses the socket peer rather than forwarded headers", () => {
  const limiter = createAuthRateLimiter({
    name: "test-ip", ipLimit: 1, accountLimit: 5, windowMs: 60_000,
    store: createMemoryRateLimitStore(),
  });
  invoke(limiter, { ip: "192.0.2.10", email: "first@example.com", forwardedFor: "203.0.113.10" });
  const second = invoke(limiter, {
    ip: "192.0.2.10", email: "second@example.com", forwardedFor: "198.51.100.20",
  });
  assert.equal(second.status, 429);
});

test("an exceeded IP is rejected before any new account bucket is consumed", () => {
  const calls = [];
  const store = {
    consume(key, limit, windowMs) {
      calls.push(key);
      if (key.endsWith(":ip:192.0.2.30") && calls.filter((item) => item === key).length > 1) {
        return { limited: true, retryAfterSeconds: 60 };
      }
      return { limited: false, retryAfterSeconds: 60 };
    },
  };
  const limiter = createAuthRateLimiter({ name: "test-flood", ipLimit: 1, accountLimit: 10, store });
  invoke(limiter, { ip: "192.0.2.30", email: "first@example.com" });
  const blocked = invoke(limiter, { ip: "192.0.2.30", email: "unique@example.com" });

  assert.equal(blocked.status, 429);
  assert.equal(calls.length, 3);
  assert.equal(calls.filter((key) => key.includes(":account:")).length, 1);
});

test("unique-email flooding from an over-limit IP cannot grow the account store", () => {
  const store = createMemoryRateLimitStore({ maxBuckets: 100 });
  const limiter = createAuthRateLimiter({ name: "test-flood", ipLimit: 1, accountLimit: 10, store });
  invoke(limiter, { ip: "192.0.2.31", email: "first@example.com" });
  const sizeAfterFirst = store.size;

  for (let index = 0; index < 200; index += 1) {
    const result = invoke(limiter, { ip: "192.0.2.31", email: `unique-${index}@example.com` });
    assert.equal(result.status, 429);
  }

  assert.equal(sizeAfterFirst, 2);
  assert.equal(store.size, sizeAfterFirst);
});

const createIngressTestServer = ({ ipLimit = 1, now = () => Date.now() } = {}) => {
  const app = express();
  app.use("/api/v1/auth", createAuthIngressRateLimiter({
    ipLimit,
    windowMs: 60_000,
    store: createMemoryRateLimitStore({ now }),
  }));
  app.use(express.json());
  app.post("/api/v1/auth/login", validate(loginSchema), (req, res) => res.sendStatus(204));
  app.use((error, req, res, next) => res.status(400).json({ success: false, message: error.message }));
  return createServer(app);
};

const withServer = async (server, callback) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    await callback(`http://127.0.0.1:${port}/api/v1/auth/login`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
};

test("ingress limiter throttles malformed JSON before the JSON parser", async () => {
  const server = createIngressTestServer();
  await withServer(server, async (url) => {
    const request = () => fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const malformed = await request();
    const blocked = await request();
    assert.equal(malformed.status, 400);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("retry-after"), "60");
    assert.deepEqual(await blocked.json(), {
      success: false,
      message: "Too many authentication requests. Please wait before trying again.",
    });
  });
});

test("ingress limiter counts schema-invalid JSON before validation", async () => {
  const server = createIngressTestServer();
  await withServer(server, async (url) => {
    const request = () => fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    const invalid = await request();
    const blocked = await request();
    assert.equal(invalid.status, 400);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("retry-after"), "60");
  });
});

test("capacity pressure remains bounded, isolated, and recovers after expiry", () => {
  let now = 0;
  const fullStore = createMemoryRateLimitStore({ maxBuckets: 2, now: () => now });
  const limitedRoute = createAuthRateLimiter({
    name: "capacity-login", ipLimit: 10, accountLimit: 10, windowMs: 1_000, store: fullStore,
  });
  const unrelatedRoute = createAuthRateLimiter({
    name: "capacity-reset", ipLimit: 10, accountLimit: 10, windowMs: 1_000,
    store: createMemoryRateLimitStore({ maxBuckets: 2, now: () => now }),
  });

  assert.equal(invoke(limitedRoute, { ip: "192.0.2.40", email: "one@example.com" }).nextCalls, 1);
  const capacityResponse = invoke(limitedRoute, { ip: "192.0.2.41", email: "two@example.com" });
  assert.equal(capacityResponse.status, 503);
  assert.equal(fullStore.size, 2);
  assert.equal(invoke(unrelatedRoute, { ip: "192.0.2.41", email: "two@example.com" }).nextCalls, 1);

  now = 1_000;
  assert.equal(invoke(limitedRoute, { ip: "192.0.2.42", email: "three@example.com" }).nextCalls, 1);
  assert.equal(fullStore.size, 2);
});

test("ingress capacity is bounded per public path and does not starve another path", () => {
  const ingress = createAuthIngressRateLimiter({
    ipLimit: 10,
    maxBucketsPerPath: 1,
    store: undefined,
  });
  assert.equal(invokeIngress(ingress, { path: "/login", ip: "192.0.2.60" }).nextCalls, 1);
  assert.equal(invokeIngress(ingress, { path: "/login", ip: "192.0.2.61" }).status, 503);
  assert.equal(invokeIngress(ingress, { path: "/forgot-password", ip: "192.0.2.61" }).nextCalls, 1);
  assert.equal(invokeIngress(ingress, { path: "/me", ip: "192.0.2.61" }).nextCalls, 1);
});

test("password-reset throttling response does not depend on account existence", () => {
  let now = 0;
  const limiter = createAuthRateLimiter({
    name: "test-reset", ipLimit: 20, accountLimit: 1, windowMs: 60_000,
    store: createMemoryRateLimitStore({ now: () => now }),
  });
  invoke(limiter, { email: "known@example.com" });
  const known = invoke(limiter, { email: "known@example.com" });
  const unknown = invoke(limiter, { email: "unknown@example.com" });
  assert.equal(known.status, 429);
  assert.equal(unknown.nextCalls, 1);
  assert.deepEqual(known.body, {
    success: false,
    message: "Too many authentication requests. Please wait before trying again.",
  });
});
