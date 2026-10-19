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

  if (statusCode === 429 && err.retryAfterSeconds) {
    res.setHeader("Retry-After", String(err.retryAfterSeconds));
  }

  // Log raw technical error server-side
  logger.error(`[${req.method} ${req.path}] ${rawMessage}`, {
    statusCode,
    ...(err.stack ? { stack: err.stack } : {}),
  });

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

export default errorHandler;
