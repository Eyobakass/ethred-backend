const { ApiError } = require('./errorHandler');

/**
 * RBAC guard factory — SRS REQ-AUTH-03
 * @param {...string} roles - Allowed roles (e.g., 'ADMIN', 'AGENCY_ADMIN')
 * @returns Express middleware
 *
 * Usage:
 *   router.get('/admin/users', authenticate, authorize('ADMIN'), handler)
 *   router.post('/agencies', authenticate, authorize('AGENCY_ADMIN', 'ADMIN'), handler)
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError('Unauthorized.', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ApiError(
          `Access denied. Required role(s): ${roles.join(', ')}. Your role: ${req.user.role}`,
          403
        )
      );
    }

    next();
  };
};

module.exports = authorize;
