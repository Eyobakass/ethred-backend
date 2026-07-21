const express = require('express');
const router = express.Router();
const controller = require('./controller');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');

// ── Protected ──────────────────────────────────────────────────────────────────
// Initiate a Chapa payment checkout (SRS REQ-PAY-01)
router.post('/initiate',
  authenticate,
  authorize('SELLER', 'AGENCY_ADMIN', 'ADMIN'),
  controller.initiatePayment
);

// List user's invoices
router.get('/invoices',
  authenticate,
  controller.listInvoices
);

// Get single invoice
router.get('/invoices/:id',
  authenticate,
  controller.getInvoice
);

// ── Public (Chapa calls this) ──────────────────────────────────────────────────
// IMPORTANT: raw body is parsed in app.js for HMAC verification (SRS Section 4.3)
router.post('/chapa-webhook', controller.chapaWebhook);

module.exports = router;
