export class AppError extends Error {
  constructor(message, statusCode = 500, errors = null, retryAfterSeconds = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;
    this.errors = errors;
    this.retryAfterSeconds = Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds
      : null;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
