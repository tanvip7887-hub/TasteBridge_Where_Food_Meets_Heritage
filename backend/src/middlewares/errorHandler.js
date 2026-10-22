import { HTTP_STATUS, ENVIRONMENT, API_MESSAGES } from "../constants/index.js";
import { logger } from "../utils/logger.js";

const TECHNICAL_ERROR_PATTERNS = [
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "RabbitMQ",
  "SMTP",
  "AMQP",
  "channel closed",
  "socket hang up",
  "Nodemailer",
  "Invalid login",
  "connection is unavailable",
];

export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let rawMessage = err.message || API_MESSAGES.INTERNAL_ERROR;
  let errors = err.errors || null;

  if (err.name === "MulterError") {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    err.isOperational = true;
    if (err.code === "LIMIT_FILE_SIZE") {
      rawMessage = "Uploaded file exceeds the maximum allowed file size.";
    }
  }

  const isDev = process.env.NODE_ENV === ENVIRONMENT.DEVELOPMENT;

  if (statusCode < HTTP_STATUS.INTERNAL_SERVER_ERROR && !err.isOperational && !isDev) {
    statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
  }

  if (statusCode === 429 && err.retryAfterSeconds) {
    res.setHeader("Retry-After", String(err.retryAfterSeconds));
  }

  const candidateRequestId = req.id ?? req.headers?.["x-request-id"];
  const requestId = typeof candidateRequestId === "string" && /^[a-zA-Z0-9._:-]{1,128}$/.test(candidateRequestId)
    ? candidateRequestId
    : undefined;
  const endpoint = req.route?.path
    ? `${req.baseUrl || ""}${req.route.path}`
    : req.path;
  const safeEndpoint = redactSensitiveText(endpoint || "unknown");
  const safeErrorCode = typeof err.errorCode === "string" && /^[A-Z0-9_]{1,64}$/.test(err.errorCode)
    ? err.errorCode
    : `HTTP_${statusCode}`;
  const logMeta = { ...(requestId ? { requestId } : {}), endpoint: safeEndpoint, statusCode, errorCode: safeErrorCode };

  // Client errors are expected application outcomes. Never log their message,
  // request data, or stack: validation messages can contain user supplied PII.
  if (statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
    logger.error(`[${req.method} ${safeEndpoint}] Unexpected server error`, {
      ...logMeta,
      errorType: /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(err.name || "") ? err.name : "Error",
      // Exclude the first stack line because it contains the raw exception
      // message, which can include provider payloads or personal information.
      ...(err.stack ? { stack: redactSensitiveText(err.stack.split("\n").slice(1).join("\n")) } : {}),
    });
  } else {
    logger.warn(`[${req.method} ${safeEndpoint}] Request rejected`, logMeta);
  }

  // Check if raw error contains infrastructure technical details that should be sanitized
  const isTechnicalError = TECHNICAL_ERROR_PATTERNS.some((pattern) =>
    rawMessage.includes(pattern)
  );

  let clientMessage = rawMessage;

  if (isTechnicalError || (!err.isOperational && !isDev)) {
    if (!err.isOperational && !isDev) {
      statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
    }
    clientMessage = "An unexpected error occurred. Please try again.";
    errors = null;
  }

  const response = {
    success: false,
    message: clientMessage,
  };

  if (errors !== null) {
    response.errors = errors;
  }

  // Never expose stack trace or raw socket errors to clients
  if (isDev && err.stack && !isTechnicalError && !err.suppressStackTrace) {
    response.stack = err.stack;
  }

  return res.status(statusCode).json(response);
};

const redactSensitiveText = (value) => String(value ?? "")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
  .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted-phone]")
  .replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, "[redacted-hash]")
  .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted-token]")
  .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[redacted-token]")
  .replace(/\b\d{6}\b/g, "[redacted-code]")
  .replace(/((?:authorization|password|token|secret|otp(?:hash)?|code|api[_-]?key)\s*[:=]\s*)(?:Bearer\s+)?[^\s,;]+/gi, "$1[redacted]");

export default errorHandler;
