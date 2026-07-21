const express = require('express');
const router = express.Router();
const controller = require('./controller');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');

router.use(authenticate);

// Buyer sends an inquiry on a listing
router.post('/', authorize('BUYER', 'SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT'), controller.createInquiry);

// Buyer's own sent inquiries
router.get('/', controller.getMyInquiries);

// Seller/Agent's received inquiries
router.get('/received', authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'), controller.getReceivedInquiries);

// Get single inquiry
router.get('/:id', controller.getInquiry);

// Update inquiry status (seller marks as RESOLVED, etc.)
router.patch('/:id/status', authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'), controller.updateStatus);

// Buyer reports a scam listing (SRS REQ-VERI-03)
router.post('/report/:propertyId', authorize('BUYER', 'SELLER'), controller.reportListing);

module.exports = router;
