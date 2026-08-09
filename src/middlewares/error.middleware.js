import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    error = new ApiError(statusCode, message, error?.errors || [], err.stack);
  }

  const response = {
    statusCode: error.statusCode,
    message: error.message,
    success: false,
    errors: error.errors,
    ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {})
  };

  logger.error(`${req.method} ${req.url} - ${error.statusCode} ${error.message}`);

  return res.status(error.statusCode).json(response);
};

export { errorHandler };
