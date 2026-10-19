import express from "express";
import cors from "cors";
import prisma from "./config/prisma.js";
import { isSmtpConfigured } from "./services/email.service.js";
import authRoutes from "./modules/auth/auth.routes.js";
import { createAuthIngressRateLimiter } from "./middlewares/authRateLimit.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import categoryRoutes, { publicDishRouter } from "./modules/category/category.routes.js";
import cookRoutes from "./modules/cook/cook.routes.js";
import cartRoutes from "./modules/cart/cart.routes.js";
import addressRoutes from "./modules/address/address.routes.js";
import ordersRoutes from "./modules/orders/orders.routes.js";
import paymentsRoutes from "./modules/payments/payments.routes.js";
import deliveryAgentRoutes from "./modules/delivery-agent/delivery-agent.routes.js";
import publicSocialContentRoutes from "./modules/cook/public-social-content.routes.js";
import favoritesRoutes from "./modules/favorites/favorites.routes.js";
import notificationRoutes from "./modules/notifications/notifications.routes.js";
import customerEventsRoutes from "./modules/events/customer-events.routes.js";
import publicExperiencesRoutes from "./modules/events/public-experiences.routes.js";
import reviewsRoutes from "./modules/reviews/reviews.routes.js";
import publicReviewRoutes from "./modules/reviews/public-reviews.routes.js";
import { sendSuccess } from "./utils/apiResponse.js";
import { notFoundHandler } from "./middlewares/notFoundHandler.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { HTTP_STATUS } from "./constants/index.js";
import env from "./config/env.js";

const app = express();

// Allow only configured browser origins. Requests without an Origin header
// (health checks and server-to-server calls) remain usable.
const allowedOrigins = new Set(
  env.CORS_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
app.use(
  cors({
    origin(origin, callback) {
      callback(null, Boolean(origin && allowedOrigins.has(origin)));
    },
    credentials: true,
  })
);

// Throttle public auth requests before parsing so malformed JSON and
// schema-invalid request bodies are counted by their socket IP.
app.use("/api/v1/auth", createAuthIngressRateLimiter());

// 2. Body Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. System Health Check Endpoint
app.get("/api/v1/health", async (req, res) => {
  let dbStatus = "disconnected";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (err) {
    dbStatus = "error";
  }

  const smtpStatus = isSmtpConfigured() ? "configured" : "unconfigured";

  const healthy = dbStatus === "connected";
  return res.status(healthy ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE).json({
    success: healthy,
    message: healthy ? "TasteBridge API is healthy" : "TasteBridge API is degraded",
    data: {
    status: healthy ? "UP" : "DEGRADED",
    services: {
      database: dbStatus,
      smtp: smtpStatus,
    },
    timestamp: new Date().toISOString(),
    },
  });
});

// 4. Application Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1", publicReviewRoutes);
app.use("/api/v1/reviews", reviewsRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/dishes", publicDishRouter);
app.use("/api/v1/cooks", cookRoutes);
app.use("/api/v1/social", publicSocialContentRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/favorites", favoritesRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/addresses", addressRoutes);
app.use("/api/v1/orders", ordersRoutes);
app.use("/api/v1/events", customerEventsRoutes);
app.use("/api/v1/experiences", publicExperiencesRoutes);
app.use("/api/v1/payments", paymentsRoutes);
app.use("/api/v1/delivery-agents", deliveryAgentRoutes);

// 5. 404 Unknown Route Handler
app.use(notFoundHandler);

// 6. Centralized Error Handler
app.use(errorHandler);

export default app;
