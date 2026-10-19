import { AppError } from "../utils/AppError.js";
import { HTTP_STATUS, API_MESSAGES } from "../constants/index.js";

export const validate = (schema) => {
  return async (req, res, next) => {
    try {
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params);
      }
      if (schema.query) {
        req.validatedQuery = await schema.query.parseAsync(req.query);
      }
      next();
    } catch (error) {
      if (error.name === "ZodError" || error.issues) {
        const formattedErrors = error.issues
          ? error.issues.map((issue) => ({
              field: issue.path.join("."),
              message: issue.message,
            }))
          : error.errors;

        return next(
          new AppError(API_MESSAGES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST, formattedErrors)
        );
      }
      next(error);
    }
  };
};

export default validate;
