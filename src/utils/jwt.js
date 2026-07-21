const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const COOKIE_NAME = process.env.JWT_COOKIE_NAME || 'ethred_token';

/**
 * Sign a JWT for the given user
 */
const signToken = (userId, role) => {
  return jwt.sign({ sub: userId, role }, SECRET, { expiresIn: EXPIRES_IN });
};

/**
 * Verify a JWT string
 */
const verifyToken = (token) => {
  return jwt.verify(token, SECRET);
};

/**
 * Attach the JWT as a secure HTTP-only cookie
 */
const setCookieToken = (res, token) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

/**
 * Clear the auth cookie
 */
const clearCookieToken = (res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true });
};

module.exports = { signToken, verifyToken, setCookieToken, clearCookieToken, COOKIE_NAME };
