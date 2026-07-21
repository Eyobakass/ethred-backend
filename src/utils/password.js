const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

/**
 * Hash a plain-text password
 */
const hashPassword = async (password) => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Compare plain-text password against hash
 */
const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

/**
 * Validate password strength per SRS REQ-AUTH-04:
 * Minimum 8 characters, 1 number, 1 special character
 */
const validatePasswordStrength = (password) => {
  if (password.length < 8) return 'Password must be at least 8 characters long';
  if (!/\d/.test(password)) return 'Password must contain at least one number';
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password))
    return 'Password must contain at least one special character';
  return null; // null = valid
};

module.exports = { hashPassword, comparePassword, validatePasswordStrength };
