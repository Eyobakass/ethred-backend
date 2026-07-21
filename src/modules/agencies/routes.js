const express = require('express');
const router = express.Router();
const controller = require('./controller');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const { uploadDocument, saveDocument } = require('../../middleware/upload');

// ── Create agency (AGENCY_ADMIN role assigned upon approval) ──────────────────
router.post('/',
  authenticate,
  (req, _res, next) => { req.docSubDir = 'documents'; next(); },
  uploadDocument.single('business_license'),
  saveDocument,
  controller.createAgency
);

// ── Get agency profile ─────────────────────────────────────────────────────────
router.get('/:id', controller.getAgency);

// ── Update agency ─────────────────────────────────────────────────────────────
router.put('/:id', authenticate, authorize('AGENCY_ADMIN', 'ADMIN'), controller.updateAgency);

// ── Invite a team member via email ────────────────────────────────────────────
router.post('/:id/invite', authenticate, authorize('AGENCY_ADMIN', 'ADMIN'), controller.inviteEmployee);

// ── List employees ────────────────────────────────────────────────────────────
router.get('/:id/employees', authenticate, authorize('AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'), controller.listEmployees);

// ── Remove employee ───────────────────────────────────────────────────────────
router.delete('/:id/employees/:userId', authenticate, authorize('AGENCY_ADMIN', 'ADMIN'), controller.removeEmployee);

// ── Dashboard analytics per agency ───────────────────────────────────────────
router.get('/:id/analytics', authenticate, authorize('AGENCY_ADMIN', 'ADMIN'), controller.getAnalytics);

module.exports = router;
