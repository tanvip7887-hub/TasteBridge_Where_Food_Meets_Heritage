export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export const ENVIRONMENT = {
  DEVELOPMENT: "development",
  PRODUCTION: "production",
  TEST: "test",
};

export const API_MESSAGES = {
  SUCCESS: "Operation completed successfully",
  HEALTH_OK: "TasteBridge API is running",
  NOT_FOUND: "Requested resource not found",
  INTERNAL_ERROR: "Internal server error",
  VALIDATION_ERROR: "Validation failed",
};

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
};
