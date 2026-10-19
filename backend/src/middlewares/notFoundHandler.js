import { AppError } from "../utils/AppError.js";
import { HTTP_STATUS } from "../constants/index.js";

export const notFoundHandler = (req, res, next) => {
  const message = `Route ${req.method} ${req.path} not found`;
  next(new AppError(message, HTTP_STATUS.NOT_FOUND));
};

export default notFoundHandler;
