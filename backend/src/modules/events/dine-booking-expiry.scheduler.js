import logger from "../../utils/logger.js";
import { createDineExpiryDiagnostics } from "./dine-expiry-log.js";

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCHES_PER_TICK = 5;

const SQLSTATE_CATEGORIES = new Map([
  ["42601", "sql_syntax_error"],
  ["42703", "undefined_column"],
  ["42704", "undefined_database_object"],
  ["42P01", "undefined_table"],
  ["42883", "undefined_function"],
  ["42501", "insufficient_privilege"],
  ["22007", "invalid_datetime_format"],
  ["22P02", "invalid_value_format"],
  ["23502", "not_null_constraint_violation"],
  ["23503", "foreign_key_constraint_violation"],
  ["23505", "unique_constraint_violation"],
  ["23514", "check_constraint_violation"],
  ["40001", "serialization_failure"],
  ["40P01", "deadlock_detected"],
  ["25P02", "transaction_already_failed"],
  ["08000", "connection_exception"],
  ["08003", "connection_does_not_exist"],
  ["08006", "connection_failure"],
]);

const isSafeCode = (value) => typeof value === "string" && /^[A-Z0-9]{5}$/.test(value);
const isPrismaCode = (value) => typeof value === "string" && /^P\d{4}$/.test(value);

const safelyRead = (read) => {
  try { return read(); } catch { return undefined; }
};

const safelyRecordDiagnostic = (diagnostics, event, fields) => {
  try { diagnostics?.record?.(event, fields); } catch { /* Diagnostics must not alter scheduler behavior. */ }
};

const safeErrorName = (error) => {
  const name = safelyRead(() => error?.name);
  return typeof name === "string" && /^(?:Error|PrismaClientKnownRequestError|PrismaClientUnknownRequestError|PrismaClientInitializationError)$/.test(name)
    ? name
    : "Error";
};

export const getDineExpiryErrorDiagnostics = (error) => {
  const prismaCode = safelyRead(() => error?.code);
  const postgresSqlState = [
    safelyRead(() => error?.meta?.driverAdapterError?.cause?.originalCode),
    safelyRead(() => error?.meta?.code),
    safelyRead(() => error?.originalCode),
    safelyRead(() => error?.cause?.code),
  ].find((code) => isSafeCode(code) && code !== prismaCode) || "unknown";
  const stage = safelyRead(() => error?.dineExpiryStage);

  return {
    prismaCode: isPrismaCode(prismaCode) ? prismaCode : "unknown",
    postgresSqlState,
    category: SQLSTATE_CATEGORIES.get(postgresSqlState) || "unclassified_database_error",
    stage: ["due-booking-lock", "seat-release"].includes(stage) ? stage : "unknown",
  };
};

export const createDineBookingExpiryScheduler = ({
  service,
  log = logger,
  diagnostics = createDineExpiryDiagnostics({ log }),
  intervalMs = DEFAULT_INTERVAL_MS,
  batchSize = DEFAULT_BATCH_SIZE,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) => {
  if (!service || typeof service.runBatch !== "function") throw new TypeError("A Dine booking expiry service is required.");
  if (!Number.isInteger(intervalMs) || intervalMs < 1000) throw new RangeError("Dine expiry interval must be at least one second.");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new RangeError("Dine expiry batch size must be between 1 and 1000.");

  let timer = null;
  let inFlight = null;

  const runTick = () => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      let expiredCount = 0;
      let releasedSeats = 0;
      for (let batch = 0; batch < MAX_BATCHES_PER_TICK; batch += 1) {
        const result = await service.runBatch();
        expiredCount += result.expiredCount;
        releasedSeats += result.releasedSeats;
        if (result.expiredCount < batchSize) break;
      }
      if (expiredCount > 0) {
        try { log.info("Expired Dine booking holds and released reserved seats.", { expiredCount, releasedSeats }); }
        catch { /* Logging must not affect expiry processing. */ }
      }
      return { expiredCount, releasedSeats };
    })().catch((error) => {
      // Include stable operational identifiers only; never log customer data or
      // database error messages that may contain SQL or connection details.
      const safeDetails = getDineExpiryErrorDiagnostics(error);
      safelyRecordDiagnostic(diagnostics, "expiry-failed", safeDetails);
      try { log.error("Dine booking hold expiry run failed.", { errorName: safeErrorName(error), ...safeDetails }); }
      catch { /* Preserve the original expiry failure result if console logging fails. */ }
      return { expiredCount: 0, releasedSeats: 0, failed: true };
    }).finally(() => { inFlight = null; });
    return inFlight;
  };

  const start = () => {
    if (timer) return { stop };
    // An immediate run recovers persisted overdue holds after an application
    // restart; subsequent polls provide durable recurring processing.
    void runTick();
    timer = setIntervalFn(() => { void runTick(); }, intervalMs);
    timer.unref?.();
    return { stop };
  };

  const stop = async () => {
    if (timer) clearIntervalFn(timer);
    timer = null;
    if (inFlight) await inFlight;
  };

  return { start, stop, runTick };
};

export const REQUIRED_DINE_EXPIRY_MIGRATIONS = Object.freeze([
  "20261017170000_dine_experience_management",
  "20261018100000_add_dine_booking_seat_holds",
  "20261018120000_add_dine_payment_persistence",
]);

export const startDineBookingExpiryIfMigrated = async (database, options = {}) => {
  const log = options.log || logger;
  const diagnostics = options.diagnostics || createDineExpiryDiagnostics({ log });
  try {
    const rows = await database.$queryRaw`
      SELECT "migration_name"
      FROM "_prisma_migrations"
      WHERE "migration_name" IN (
        '20261017170000_dine_experience_management',
        '20261018100000_add_dine_booking_seat_holds',
        '20261018120000_add_dine_payment_persistence'
      )
        AND "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL
    `;
    const applied = new Set((rows || []).map((row) => row?.migration_name));
    const isReady = REQUIRED_DINE_EXPIRY_MIGRATIONS.every((name) => applied.has(name));
    if (!isReady) {
      safelyRecordDiagnostic(diagnostics, "disabled");
      try { log.warn("Dine hold expiry scheduler is disabled because required Dine migrations are not applied."); }
      catch { /* A logger failure must not affect application startup. */ }
      return null;
    }
    safelyRecordDiagnostic(diagnostics, "enabled");
    const scheduler = createDineBookingExpiryScheduler({ ...options, log, diagnostics });
    return scheduler.start();
  } catch (error) {
    const safeDetails = getDineExpiryErrorDiagnostics(error);
    safelyRecordDiagnostic(diagnostics, "check-failed", safeDetails);
    try { log.error("Dine hold expiry scheduler could not verify migration readiness.", safeDetails); }
    catch { /* A logger failure must not affect application startup. */ }
    return null;
  }
};

