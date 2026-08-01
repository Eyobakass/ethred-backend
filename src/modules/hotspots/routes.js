// ─────────────────────────────────────────────────────────────────────────────
// Hotspot Routes
// SRS Reference: SRS-ETHRED-2026-VT-1.0 §8.3–8.5
// Mount at: /api/v1/hotspots
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const controller = require('./controller');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');

// All hotspot routes require authentication
router.use(authenticate);

// POST /api/v1/hotspots — Create hotspot (SRS §8.3)
router.post(
  '/',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'),
  controller.createHotspot
);

// PATCH /api/v1/hotspots/:id — Update hotspot (SRS §8.4)
router.patch(
  '/:id',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'),
  controller.updateHotspot
);

// DELETE /api/v1/hotspots/:id — Delete hotspot (SRS §8.5)
router.delete(
  '/:id',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'),
  controller.deleteHotspot
);

module.exports = router;
