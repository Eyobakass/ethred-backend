// ─────────────────────────────────────────────────────────────────────────────
// Media Service
// SRS Reference: SRS-ETHRED-2026-VT-1.0 §8.6, §8.8
// Handles: PATCH /media/:id (dual-purpose) + GET /media?needs_repair=true
// ─────────────────────────────────────────────────────────────────────────────
const { prisma } = require('../../config/db');
const { ApiError } = require('../../middleware/errorHandler');

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the request carries a valid internal service key.
 * Used to allow the repair worker to update file_url and needs_repair.
 */
const isRepairWorker = (req) => {
  const key = req.headers['x-internal-service-key'];
  return key && key === INTERNAL_SERVICE_KEY;
};

// ── Service Methods ────────────────────────────────────────────────────────────

/**
 * PATCH /media/:id — Dual-purpose update endpoint.
 *
 * Agent/Seller path: update scene_name, initial_yaw, sort_order
 * Repair worker path (X-Internal-Service-Key): update file_url, needs_repair
 *
 * SRS §8.6
 */
const updateMedia = async (mediaId, body, user, req) => {
  const media = await prisma.propertyMedia.findUnique({
    where: { id: mediaId },
    include: { property: true },
  });

  if (!media) throw new ApiError('Media not found.', 404, 'MEDIA_NOT_FOUND');

  const workerRequest = isRepairWorker(req);

  if (workerRequest) {
    // ── Repair worker path: may only update file_url and needs_repair ─────────
    const updateData = {};
    if (body.file_url !== undefined) updateData.file_url = body.file_url;
    if (body.needs_repair !== undefined) updateData.needs_repair = Boolean(body.needs_repair);

    if (Object.keys(updateData).length === 0) {
      throw new ApiError('No valid fields provided for repair worker update.', 400);
    }

    return prisma.propertyMedia.update({ where: { id: mediaId }, data: updateData });
  }

  // ── Agent/Seller path: verify ownership ─────────────────────────────────────
  const property = media.property;
  if (user.role !== 'ADMIN' && property.owner_id !== user.id) {
    // Check agency membership
    if (property.agency_id) {
      const membership = await prisma.agencyEmployee.findFirst({
        where: { user_id: user.id, agency_id: property.agency_id },
      });
      if (!membership) throw new ApiError('You do not have permission to update this media.', 403);
    } else {
      throw new ApiError('You do not have permission to update this media.', 403);
    }
  }

  // Agents may only update these fields
  const updateData = {};
  if (body.scene_name !== undefined) updateData.scene_name = body.scene_name?.trim() || null;
  if (body.initial_yaw !== undefined) {
    const yaw = parseFloat(body.initial_yaw);
    if (isNaN(yaw) || yaw < 0 || yaw >= 360) {
      throw new ApiError('initial_yaw must be in range [0, 360).', 400);
    }
    updateData.initial_yaw = yaw;
  }
  if (body.sort_order !== undefined) {
    const order = parseInt(body.sort_order);
    if (isNaN(order) || order < 0) throw new ApiError('sort_order must be a non-negative integer.', 400);
    updateData.sort_order = order;
  }
  if (body.fp_x !== undefined) {
    const x = body.fp_x === null ? null : parseFloat(body.fp_x);
    if (x !== null && (isNaN(x) || x < 0 || x > 100)) {
      throw new ApiError('fp_x must be in percentage range [0, 100].', 400);
    }
    updateData.fp_x = x;
  }
  if (body.fp_y !== undefined) {
    const y = body.fp_y === null ? null : parseFloat(body.fp_y);
    if (y !== null && (isNaN(y) || y < 0 || y > 100)) {
      throw new ApiError('fp_y must be in percentage range [0, 100].', 400);
    }
    updateData.fp_y = y;
  }

  if (Object.keys(updateData).length === 0) {
    throw new ApiError('No valid fields provided.', 400);
  }

  return prisma.propertyMedia.update({ where: { id: mediaId }, data: updateData });
};

/**
 * GET /media?needs_repair=true&limit=N — Internal poll endpoint for repair worker.
 * Only accessible via X-Internal-Service-Key header.
 *
 * SRS §8.8
 */
const listNeedsRepair = async (query, req) => {
  if (!isRepairWorker(req)) {
    throw new ApiError('Forbidden. Internal service key required.', 403, 'INTERNAL_ONLY');
  }

  const limit = Math.min(parseInt(query.limit) || 10, 50);

  const scenes = await prisma.propertyMedia.findMany({
    where: { is_tour_scene: true, needs_repair: true },
    take: limit,
    orderBy: { created_at: 'asc' },
    select: {
      id: true,
      file_url: true,
      property_id: true,
      scene_name: true,
    },
  });

  return { scenes };
};

module.exports = { updateMedia, listNeedsRepair };
