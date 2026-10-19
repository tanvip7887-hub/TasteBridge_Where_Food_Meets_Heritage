import { createMemoryRateLimitStore } from "./authRateLimit.js";
import env from "../config/env.js";

const store = createMemoryRateLimitStore({ maxBuckets: 20_000 });

export const createSocialCommentRateLimiter = ({ limit = env.SOCIAL_COMMENT_RATE_LIMIT_PER_MINUTE, windowMs = 60_000, rateStore = store, activity = "commenting" } = {}) => {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1) {
    throw new TypeError("Social comment rate limit requires positive integer limits.");
  }

  return (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });
    const result = rateStore.consume(`social-comment:${userId}`, limit, windowMs);
    if (result.unavailable) return res.status(503).json({ success: false, message: "Commenting is temporarily unavailable. Please try again shortly." });
    if (result.limited) {
      res.setHeader("Retry-After", String(result.retryAfterSeconds));
      return res.status(429).json({ success: false, message: "You are " + activity + " too quickly. Please try again shortly." });
    }
    return next();
  };
};
