const logger = require('../utils/logger');

/**
 * Centralized error handler middleware
 * Converts errors into a consistent JSON response
 */
const errorHandler = (err, req, res, next) => {
  // Prisma known errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'A record with this value already exists.',
      field: err.meta?.target,
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Record not found.',
    });
  }

  // Prisma invalid UUID format error
  if (err.code === 'P2023' || (err.message && err.message.includes('invalid character'))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format. Must be a valid UUID.',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired.' });
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'File too large.' });
  }

  // Generic / unexpected
  const statusCode = err.statusCode || err.status || 500;
  logger.error(`[${statusCode}] ${req.method} ${req.path}:`, err);

  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? 'Internal server error.' : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

/**
 * Helper to create a custom API error
 */
class ApiError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = errorHandler;
module.exports.ApiError = ApiError;
