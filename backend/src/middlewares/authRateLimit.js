import { createHash } from "node:crypto";

const AUTH_WINDOW_MS = 15 * 60 * 1000;
const MAX_BUCKETS = 50_000;
const MAX_BUCKETS_PER_ROUTE = 6_000;
const MAX_INGRESS_BUCKETS_PER_PATH = 1_000;
const TOO_MANY_REQUESTS_MESSAGE = "Too many authentication requests. Please wait before trying again.";

/**
 * Process-local fixed-window storage. This bounds memory and is suitable for a
 * single API process only; multi-process deployments need a shared store.
 */
export const createMemoryRateLimitStore = ({ now = Date.now, maxBuckets = MAX_BUCKETS } = {}) => {
  const buckets = new Map();

  return {
    consume(key, limit, windowMs) {
      const currentTime = now();
      let bucket = buckets.get(key);

      if (!bucket || bucket.resetAt <= currentTime) {
        if (!bucket && buckets.size >= maxBuckets) {
          for (const [existingKey, existingBucket] of buckets) {
            if (existingBucket.resetAt <= currentTime) buckets.delete(existingKey);
          }
        }

        if (!bucket && buckets.size >= maxBuckets) return { unavailable: true };
        bucket = { count: 0, resetAt: currentTime + windowMs };
        buckets.set(key, bucket);
      }

      bucket.count += 1;
      return {
        limited: bucket.count > limit,
        remaining: Math.max(0, limit - bucket.count),
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000)),
      };
    },
    get size() {
      return buckets.size;
    },
  };
};

const normalizedEmailKey = (email) => {
  if (typeof email !== "string" || !email.trim()) return null;
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
};

/**
 * Apply independent per-IP and per-account fixed-window limits. The IP is
 * always taken from the socket peer; forwarded headers are intentionally
 * ignored because this application does not configure a trusted proxy.
 */
export const createAuthRateLimiter = ({
  name,
  ipLimit,
  accountLimit,
  windowMs = AUTH_WINDOW_MS,
  store = createMemoryRateLimitStore(),
}) => {
  if (!name || !Number.isInteger(ipLimit) || !Number.isInteger(accountLimit)) {
    throw new TypeError("Auth rate limiters require a name and integer IP/account limits.");
  }

  return (req, res, next) => {
    const socketAddress = req.socket?.remoteAddress || "unknown";
    const ipResult = store.consume(`${name}:ip:${socketAddress}`, ipLimit, windowMs);
    if (ipResult.unavailable) return sendCapacityResponse(res);
    if (ipResult.limited) return sendLimitedResponse(res, [ipResult]);

    const emailHash = normalizedEmailKey(req.body?.email);
    if (emailHash) {
      const accountResult = store.consume(`${name}:account:${emailHash}`, accountLimit, windowMs);
      if (accountResult.unavailable) return sendCapacityResponse(res);
      if (accountResult.limited) {
        const exhaustedResults = ipResult.remaining === 0 ? [ipResult, accountResult] : [accountResult];
        return sendLimitedResponse(res, exhaustedResults);
      }
    }

    return next();
  };
};

const sendLimitedResponse = (res, limitedResults) => {
  const retryAfterSeconds = Math.max(...limitedResults.map((result) => result.retryAfterSeconds));
  res.setHeader("Retry-After", String(retryAfterSeconds));
  return res.status(429).json({ success: false, message: TOO_MANY_REQUESTS_MESSAGE });
};

const sendCapacityResponse = (res) => res.status(503).json({
  success: false,
  message: "Authentication throttling is temporarily unavailable. Please retry shortly.",
});

const PUBLIC_AUTH_POST_PATHS = new Set([
  "/register",
  "/register/verify-otp",
  "/verify-otp",
  "/register/resend-otp",
  "/resend-otp",
  "/login",
  "/forgot-password",
  "/verify-reset-otp",
  "/reset-password",
]);

/** IP-only guard mounted before body parsing to count malformed and invalid bodies. */
export const createAuthIngressRateLimiter = ({
  ipLimit = 120,
  windowMs = AUTH_WINDOW_MS,
  store,
  maxBucketsPerPath = MAX_INGRESS_BUCKETS_PER_PATH,
} = {}) => {
  if (!Number.isInteger(ipLimit) || ipLimit < 1) {
    throw new TypeError("Auth ingress rate limiter requires a positive integer IP limit.");
  }

  const storesByPath = new Map();
  const getStore = (path) => {
    if (store) return store;
    if (!storesByPath.has(path)) {
      storesByPath.set(path, createMemoryRateLimitStore({ maxBuckets: maxBucketsPerPath }));
    }
    return storesByPath.get(path);
  };

  return (req, res, next) => {
    if (req.method !== "POST" || !PUBLIC_AUTH_POST_PATHS.has(req.path)) return next();
    const socketAddress = req.socket?.remoteAddress || "unknown";
    const result = getStore(req.path).consume(`auth-ingress:ip:${socketAddress}`, ipLimit, windowMs);
    if (result.unavailable) return sendCapacityResponse(res);
    if (result.limited) return sendLimitedResponse(res, [result]);
    return next();
  };
};

// Each endpoint has an isolated bounded store (6,000 buckets maximum); each
// public ingress path has a separate 1,000-IP store. This caps configured
// storage at 51,000 buckets and prevents one path's key churn from starving
// other auth endpoints. Existing OTP services retain their own checks.
const limiter = (name, ipLimit, accountLimit) =>
  createAuthRateLimiter({
    name,
    ipLimit,
    accountLimit,
    store: createMemoryRateLimitStore({ maxBuckets: MAX_BUCKETS_PER_ROUTE }),
  });

export const authRateLimiters = Object.freeze({
  register: limiter("register", 10, 3),
  registrationVerify: limiter("registration-verify", 30, 10),
  registrationResend: limiter("registration-resend", 10, 3),
  login: limiter("login", 30, 10),
  passwordResetRequest: limiter("password-reset-request", 10, 3),
  passwordResetVerify: limiter("password-reset-verify", 30, 5),
  passwordResetComplete: limiter("password-reset-complete", 15, 10),
});
