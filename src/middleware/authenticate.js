const passport = require('passport');
const { ApiError } = require('./errorHandler');

/**
 * Authenticate request via JWT cookie or Bearer token.
 * Attaches req.user = { id, email, phone_number, role }
 */
const authenticate = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (err) return next(err);
    if (!user) return next(new ApiError('Unauthorized. Please log in.', 401));
    req.user = user;
    next();
  })(req, res, next);
};

module.exports = authenticate;
