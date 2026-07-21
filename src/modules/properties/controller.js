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

module.exports = {
  searchProperties, getProperty, createProperty, updateProperty, deleteProperty,
  submitForReview, uploadImages, uploadDocument, deleteMedia, getMyListings, getListingStats,
};
