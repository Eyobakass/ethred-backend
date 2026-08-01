// ─────────────────────────────────────────────────────────────────────────────
// Hotspot Controller
// SRS Reference: SRS-ETHRED-2026-VT-1.0 §8.3–8.5
// ─────────────────────────────────────────────────────────────────────────────
const HotspotService = require('./service');

/**
 * POST /api/v1/hotspots
 * Create a new NAVIGATION or INFO hotspot.
 */
const createHotspot = async (req, res, next) => {
  try {
    const hotspot = await HotspotService.createHotspot(req.body, req.user);
    res.status(201).json({ success: true, data: hotspot });
  } catch (err) { next(err); }
};

/**
 * PATCH /api/v1/hotspots/:id
 * Update hotspot position, label, or target.
 */
const updateHotspot = async (req, res, next) => {
  try {
    const hotspot = await HotspotService.updateHotspot(req.params.id, req.body, req.user);
    res.json({ success: true, data: hotspot });
  } catch (err) { next(err); }
};

/**
 * DELETE /api/v1/hotspots/:id
 * Remove a hotspot pin.
 */
const deleteHotspot = async (req, res, next) => {
  try {
    await HotspotService.deleteHotspot(req.params.id, req.user);
    res.status(204).send();
  } catch (err) { next(err); }
};

module.exports = { createHotspot, updateHotspot, deleteHotspot };
