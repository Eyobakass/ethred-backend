const express = require('express');
const router = express.Router();
const controller = require('./controller');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const { uploadImages, uploadDocument, processImages, saveDocument } = require('../../middleware/upload');
const { uploadPanorama, processPanorama } = require('../../middleware/uploadTour');

// ── Public routes ─────────────────────────────────────────────────────────────
// SRS REQ-SRCH-01: Search with filters
router.get('/search', controller.searchProperties);

// Public property detail
router.get('/:id', controller.getProperty);

// GET /api/v1/properties/:id/tour — public tour config (SRS §8.2, REQ-TOUR-VIEW-01)
// IMPORTANT: must come before router.use(authenticate) so it remains public
router.get('/:id/tour', controller.getTourConfig);

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

// Create a draft clone of an APPROVED property
router.post('/:id/draft',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'),
  controller.createDraftClone
);

// Get existing active draft for an APPROVED property (returns null if none)
router.get('/:id/draft',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'),
  controller.getExistingDraft
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

// Update a media item (e.g., scene_name)
router.patch('/:id/media/:mediaId',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'),
  controller.updateMedia
);

// Get seller's own listings
router.get('/', authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'), controller.getMyListings);

// Seller dashboard stats (SRS REQ-SELL-02)
router.get('/:id/stats',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'),
  controller.getListingStats
);

// ── Tour Routes (SRS-ETHRED-2026-VT-1.0) ─────────────────────────────────

// Upload a 360° panorama as a tour scene (SRS §8.1, REQ-TOUR-ING-01)
// Query params: scene_name, initial_yaw
router.post('/:id/media/tour-scene',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'),
  uploadPanorama.single('file'),   // multer: memory storage, JPEG/PNG only
  processPanorama,                  // sharp: validate 2:1, downsample, save
  controller.uploadTourScene
);

// Bulk reorder tour scenes (SRS §8.7, REQ-TOUR-AUTH-08)
router.patch('/:id/tour/reorder',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'),
  controller.reorderTourScenes
);

// Upload floor plan image for tour (SRS §7.4, REQ-TOUR-FP-01)
router.post('/:id/floor-plan',
  authorize('SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN'),
  (req, _res, next) => { req.docSubDir = 'floorplans'; next(); },
  uploadDocument.single('file'),
  saveDocument,
  controller.uploadFloorPlan
);


module.exports = router;
