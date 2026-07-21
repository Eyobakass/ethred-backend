const express = require('express');
const router = express.Router();
const controller = require('./controller');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');

// All admin routes require authentication + ADMIN role
router.use(authenticate, authorize('ADMIN'));

// ── Properties Moderation (SRS REQ-VERI-01, Section 8.1) ─────────────────────
router.get('/properties/pending', controller.getPendingProperties);
router.patch('/properties/:id/approve', controller.approveProperty);
router.patch('/properties/:id/suspend', controller.suspendProperty);
router.patch('/properties/:id/reject', controller.rejectProperty);

// ── User Management ────────────────────────────────────────────────────────────
router.get('/users', controller.listUsers);
router.get('/users/:id', controller.getUser);
router.patch('/users/:id/ban', controller.banUser);
router.patch('/users/:id/verify-identity', controller.verifyUserIdentity);
router.patch('/users/:id/role', controller.changeUserRole);

// ── Agency Moderation (SRS REQ-USER-04) ───────────────────────────────────────
router.get('/agencies/pending', controller.getPendingAgencies);
router.patch('/agencies/:id/approve', controller.approveAgency);
router.patch('/agencies/:id/reject', controller.rejectAgency);

// ── Audit Logs (SRS REQ 3.13) ─────────────────────────────────────────────────
router.get('/audit-logs', controller.getAuditLogs);

// ── Dashboard Stats ────────────────────────────────────────────────────────────
router.get('/dashboard', controller.getDashboardStats);

module.exports = router;
