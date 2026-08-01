// ─────────────────────────────────────────────────────────────────────────────
// Media Routes
// SRS Reference: SRS-ETHRED-2026-VT-1.0 §8.6, §8.8
// Mount at: /api/v1/media
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const controller = require('./controller');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');

// ── GET /api/v1/media?needs_repair=true — Internal repair worker poll (SRS §8.8)
// Note: No JWT auth — validated via X-Internal-Service-Key header inside service
router.get('/', controller.listNeedsRepair);

// ── PATCH /api/v1/media/:id — Dual-purpose update (SRS §8.6)
// Repair worker calls with X-Internal-Service-Key (no JWT).
// Agents call with JWT cookie.
// We attempt JWT auth but fall through if absent (service handles the distinction).
router.patch('/:id', (req, res, next) => {
  // If request carries internal service key → skip JWT auth
  const serviceKey = req.headers['x-internal-service-key'];
  const internalKey = process.env.INTERNAL_SERVICE_KEY || '';
  if (serviceKey && serviceKey === internalKey) {
    return next(); // skip authenticate, go directly to controller
  }
  // Otherwise require standard JWT authentication
  authenticate(req, res, next);
}, controller.updateMedia);

module.exports = router;
