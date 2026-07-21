const express = require('express');
const router = express.Router();
const controller = require('./controller');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const { uploadImages, uploadDocument, processImages, saveDocument } = require('../../middleware/upload');

// ── Public routes ─────────────────────────────────────────────────────────────
// SRS REQ-SRCH-01: Search with filters
router.get('/search', controller.searchProperties);

// Public property detail
router.get('/:id', controller.getProperty);

// ── Protected routes ──────────────────────────────────────────────────────────
router.use(authenticate);

// Create property (Sellers + Agency agents + Admin)
router.post('/',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'),
  controller.createProperty
);

// Update property
router.put('/:id',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'),
  controller.updateProperty
);

// Delete property
router.delete('/:id',
  authorize('SELLER', 'AGENCY_ADMIN', 'ADMIN'),
  controller.deleteProperty
);

// Submit listing for review: DRAFT → PENDING
router.post('/:id/submit',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT'),
  controller.submitForReview
);

// Upload property images (SRS REQ-PROP-01)
router.post('/:id/media/images',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'),
  uploadImages.array('images', 10),
  processImages,
  controller.uploadImages
);

// Upload property documents (deed, floor plan — SRS REQ-PROP-02)
router.post('/:id/media/documents',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'),
  (req, _res, next) => { req.docSubDir = 'documents'; next(); },
  uploadDocument.single('document'),
  saveDocument,
  controller.uploadDocument
);

// Delete a media item
router.delete('/:id/media/:mediaId',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'),
  controller.deleteMedia
);

// Get seller's own listings
router.get('/', authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'), controller.getMyListings);

// Seller dashboard stats (SRS REQ-SELL-02)
router.get('/:id/stats',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'),
  controller.getListingStats
);

module.exports = router;
