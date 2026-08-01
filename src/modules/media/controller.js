// ─────────────────────────────────────────────────────────────────────────────
// Media Controller
// SRS Reference: SRS-ETHRED-2026-VT-1.0 §8.6, §8.8
// ─────────────────────────────────────────────────────────────────────────────
const MediaService = require('./service');

/**
 * PATCH /api/v1/media/:id
 * Dual-purpose: agent updates metadata OR repair worker updates file_url/needs_repair.
 */
const updateMedia = async (req, res, next) => {
  try {
    const media = await MediaService.updateMedia(req.params.id, req.body, req.user, req);
    res.json({ success: true, data: media });
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/media?needs_repair=true&limit=N
 * Internal: returns scenes the repair worker should process.
 */
const listNeedsRepair = async (req, res, next) => {
  try {
    const result = await MediaService.listNeedsRepair(req.query, req);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

module.exports = { updateMedia, listNeedsRepair };
