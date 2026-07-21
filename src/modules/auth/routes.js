const express = require('express');
const router = express.Router();
const passport = require('passport');
const controller = require('./controller');
const { authLimiter } = require('../../middleware/rateLimiter');
const authenticate = require('../../middleware/authenticate');

// ── Email/Password Registration & Login ──────────────────────────────────────
router.post('/register', authLimiter, controller.register);
router.post('/login', authLimiter, controller.login);
router.post('/logout', authenticate, controller.logout);

// ── Email OTP Flow (replaces phone OTP per user setup) ───────────────────────
router.post('/send-otp', authLimiter, controller.sendOTP);
router.post('/verify-otp', authLimiter, controller.verifyOTP);

// ── Password Reset ────────────────────────────────────────────────────────────
router.post('/forgot-password', authLimiter, controller.forgotPassword);
router.post('/reset-password', authLimiter, controller.resetPassword);

// ── Google OAuth ──────────────────────────────────────────────────────────────
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  controller.googleCallback
);

// ── Token Refresh ─────────────────────────────────────────────────────────────
router.post('/refresh', controller.refreshToken);

// ── Get current session ───────────────────────────────────────────────────────
router.get('/me', authenticate, controller.getMe);

module.exports = router;
