const PropertyService = require('./service');

const searchProperties = async (req, res, next) => {
  try {
    const result = await PropertyService.searchProperties(req.query);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const getProperty = async (req, res, next) => {
  try {
    const property = await PropertyService.getProperty(req.params.id);
    res.json({ success: true, data: property });
  } catch (err) { next(err); }
};

const createProperty = async (req, res, next) => {
  try {
    const property = await PropertyService.createProperty(req.user, req.body);
    res.status(201).json({ success: true, data: property });
  } catch (err) { next(err); }
};

const updateProperty = async (req, res, next) => {
  try {
    const property = await PropertyService.updateProperty(req.params.id, req.user, req.body);
    res.json({ success: true, data: property });
  } catch (err) { next(err); }
};

const deleteProperty = async (req, res, next) => {
  try {
    await PropertyService.deleteProperty(req.params.id, req.user);
    res.json({ success: true, message: 'Property deleted.' });
  } catch (err) { next(err); }
};

const submitForReview = async (req, res, next) => {
  try {
    const property = await PropertyService.submitForReview(req.params.id, req.user);
    res.json({ success: true, data: property });
  } catch (err) { next(err); }
};

const uploadImages = async (req, res, next) => {
  try {
    const media = await PropertyService.attachMedia(req.params.id, req.user, req.processedFiles || [], 'IMAGE');
    res.status(201).json({ success: true, data: media });
  } catch (err) { next(err); }
};

const uploadDocument = async (req, res, next) => {
  try {
    if (!req.savedDocument) return res.status(400).json({ success: false, message: 'No document uploaded.' });
    const media = await PropertyService.attachMedia(req.params.id, req.user, [{ file_url: req.savedDocument.file_url }], 'DOCUMENT');
    res.status(201).json({ success: true, data: media });
  } catch (err) { next(err); }
};

const deleteMedia = async (req, res, next) => {
  try {
    await PropertyService.deleteMedia(req.params.id, req.params.mediaId, req.user);
    res.json({ success: true, message: 'Media deleted.' });
  } catch (err) { next(err); }
};

const getMyListings = async (req, res, next) => {
  try {
    const result = await PropertyService.getMyListings(req.user, req.query);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const getListingStats = async (req, res, next) => {
  try {
    const stats = await PropertyService.getListingStats(req.params.id, req.user);
    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
};

// ── Tour Controllers (SRS-ETHRED-2026-VT-1.0) ────────────────────────────────

/**
 * GET /api/v1/properties/:id/tour
 * Returns Pannellum-compatible tour config (public, no auth).
 */
const getTourConfig = async (req, res, next) => {
  try {
    const config = await PropertyService.getTourConfig(req.params.id);
    // Cache for 5 minutes on CDN, 60s on edge
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=60');
    res.json(config);
  } catch (err) { next(err); }
};

/**
 * POST /api/v1/properties/:id/media/tour-scene
 * Upload a 360° panorama as a new tour scene.
 * Expects req.tourScene from processPanorama middleware.
 */
const uploadTourScene = async (req, res, next) => {
  try {
    if (!req.tourScene) {
      return res.status(400).json({ success: false, message: 'Panorama processing failed.', error: 'NO_PROCESSED_FILE' });
    }
    const media = await PropertyService.uploadTourScene(
      req.params.id,
      req.user,
      req.tourScene,
      req.query
    );
    res.status(201).json({ success: true, data: media });
  } catch (err) { next(err); }
};

/**
 * PATCH /api/v1/properties/:id/tour/reorder
 * Bulk update sort_order for multiple scenes.
 */
const reorderTourScenes = async (req, res, next) => {
  try {
    const result = await PropertyService.reorderTourScenes(
      req.params.id,
      req.user,
      req.body.scene_order
    );
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

/**
 * POST /api/v1/properties/:id/floor-plan
 * Upload or update floor plan image for a property.
 */
const uploadFloorPlan = async (req, res, next) => {
  try {
    const fileUrl = req.savedDocument?.file_url || req.body.file_url;
    if (!fileUrl) {
      return res.status(400).json({ success: false, message: 'No floor plan file or URL provided.' });
    }
    const property = await PropertyService.uploadFloorPlan(req.params.id, req.user, fileUrl);
    res.status(200).json({ success: true, data: property });
  } catch (err) { next(err); }
};

module.exports = {
  searchProperties, getProperty, createProperty, updateProperty, deleteProperty,
  submitForReview, uploadImages, uploadDocument, deleteMedia, getMyListings, getListingStats,
  // Tour
  getTourConfig, uploadTourScene, reorderTourScenes, uploadFloorPlan,
};
