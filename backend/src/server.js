import "dotenv/config";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import prisma from "./config/prisma.js";
import { verifySmtpConnection } from "./services/email.service.js";
import { createDineBookingExpiryService } from "./modules/events/dine-booking-expiry.service.js";
import { startDineBookingExpiryIfMigrated } from "./modules/events/dine-booking-expiry.scheduler.js";
import logger from "./utils/logger.js";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  console.log("=================================================");
  console.log("       TASTEBRIDGE BACKEND SERVER STARTUP        ");
  console.log("=================================================");

  // 1. Connect PostgreSQL DB
  await connectDB();

  // 2. Verify SMTP settings (safe startup verification without sending test emails)
  await verifySmtpConnection();

  // 3. Start Express HTTP Server
  const server = app.listen(PORT, () => {
    console.log(`TasteBridge server running on port ${PORT}`);
  });

  // Do not run seat-hold queries against databases that have not received the
  // additive Phase 3A migration. The scheduler performs an immediate overdue
  // sweep after restart when the migration is present.
  const expiryService = createDineBookingExpiryService(prisma, {
    onRetry: ({ attempt, code }) => logger.warn("Retrying Dine hold expiry transaction.", { attempt, code }),
  });
  let expiryScheduler = await startDineBookingExpiryIfMigrated(prisma, { service: expiryService });
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("TasteBridge server shutting down.", { signal });
    await expiryScheduler?.stop();
    server.close(async (error) => {
      if (error) logger.error("HTTP server shutdown failed.", { errorCode: error.code || "unknown" });
      await prisma.$disconnect();
      if (error) process.exitCode = 1;
    });
  };
  process.once("SIGINT", () => { void shutdown("SIGINT"); });
  process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
};

startServer();
