// ─────────────────────────────────────────────────────────────────────────────
// Hotspot Service
// SRS Reference: SRS-ETHRED-2026-VT-1.0 §8.3–8.5, §12.1
// ─────────────────────────────────────────────────────────────────────────────
const { prisma } = require('../../config/db');
const { ApiError } = require('../../middleware/errorHandler');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Verify the requesting user owns the property that the scene belongs to.
 * Allows ADMIN bypass. Agency agents are validated via AgencyEmployee membership.
 */
const verifySceneOwnership = async (scene, userId, userRole) => {
  if (userRole === 'ADMIN') return;

  const property = scene.property;

  // Direct owner check
  if (property.owner_id === userId) return;

  // Agency agent membership check
  if (property.agency_id) {
    const membership = await prisma.agencyEmployee.findFirst({
      where: { user_id: userId, agency_id: property.agency_id },
    });
    if (membership) return;
  }

  throw new ApiError('You do not have permission to modify this scene.', 403);
};

// ── Service Methods ────────────────────────────────────────────────────────────

/**
 * Create a new hotspot (NAVIGATION or INFO).
 * SRS REQ-TOUR-AUTH-04 | §8.3
 */
const createHotspot = async (body, user) => {
  const { scene_id, type, yaw, pitch, target_scene_id, label } = body;

  // ── Fetch scene with property info ─────────────────────────────────────────
  const scene = await prisma.propertyMedia.findUnique({
    where: { id: scene_id },
    include: { property: true },
  });

  if (!scene || !scene.is_tour_scene) {
    throw new ApiError('Scene not found or is not a tour scene.', 404, 'SCENE_NOT_FOUND');
  }

  await verifySceneOwnership(scene, user.id, user.role);

  // ── Field validation ───────────────────────────────────────────────────────
  if (typeof yaw !== 'number' || yaw < 0 || yaw >= 360) {
    throw new ApiError('yaw must be a number in range [0, 360).', 400, 'INVALID_YAW');
  }
  if (typeof pitch !== 'number' || pitch < -90 || pitch > 90) {
    throw new ApiError('pitch must be a number in range [-90, 90].', 400, 'INVALID_PITCH');
  }

  if (type === 'NAVIGATION') {
    if (!target_scene_id) {
      throw new ApiError('target_scene_id is required for NAVIGATION hotspots.', 400, 'MISSING_TARGET_SCENE');
    }
    if (target_scene_id === scene_id) {
      throw new ApiError('A hotspot cannot target its own scene.', 400, 'SELF_REFERENCING_HOTSPOT');
    }
    const targetScene = await prisma.propertyMedia.findUnique({ where: { id: target_scene_id } });
    if (!targetScene || targetScene.property_id !== scene.property_id) {
      throw new ApiError('Target scene must belong to the same property tour.', 400, 'TARGET_NOT_IN_SAME_TOUR');
    }
  }

  if (type === 'INFO' && (!label || label.trim().length === 0)) {
    throw new ApiError('label is required for INFO hotspots.', 400, 'MISSING_LABEL');
  }

  if (!['NAVIGATION', 'INFO'].includes(type)) {
    throw new ApiError('type must be NAVIGATION or INFO.', 400, 'INVALID_HOTSPOT_TYPE');
  }

  // ── Create hotspot ─────────────────────────────────────────────────────────
  return prisma.hotspot.create({
    data: {
      scene_id,
      type,
      yaw,
      pitch,
      target_scene_id: type === 'NAVIGATION' ? target_scene_id : null,
      label: label?.trim() || null,
    },
  });
};

/**
 * Update an existing hotspot's position, label, or target.
 * SRS REQ-TOUR-AUTH-05 | §8.4
 */
const updateHotspot = async (hotspotId, body, user) => {
  const hotspot = await prisma.hotspot.findUnique({
    where: { id: hotspotId },
    include: {
      scene: { include: { property: true } },
    },
  });

  if (!hotspot) throw new ApiError('Hotspot not found.', 404, 'HOTSPOT_NOT_FOUND');

  await verifySceneOwnership(hotspot.scene, user.id, user.role);

  const { yaw, pitch, label, target_scene_id } = body;
  const updateData = {};

  if (yaw !== undefined) {
    if (yaw < 0 || yaw >= 360) throw new ApiError('yaw must be in range [0, 360).', 400, 'INVALID_YAW');
    updateData.yaw = yaw;
  }
  if (pitch !== undefined) {
    if (pitch < -90 || pitch > 90) throw new ApiError('pitch must be in range [-90, 90].', 400, 'INVALID_PITCH');
    updateData.pitch = pitch;
  }
  if (label !== undefined) updateData.label = label?.trim() || null;

  if (target_scene_id !== undefined && hotspot.type === 'NAVIGATION') {
    if (target_scene_id === hotspot.scene_id) {
      throw new ApiError('A hotspot cannot target its own scene.', 400, 'SELF_REFERENCING_HOTSPOT');
    }
    const targetScene = await prisma.propertyMedia.findUnique({ where: { id: target_scene_id } });
    if (!targetScene || targetScene.property_id !== hotspot.scene.property_id) {
      throw new ApiError('Target scene must belong to the same property tour.', 400, 'TARGET_NOT_IN_SAME_TOUR');
    }
    updateData.target_scene_id = target_scene_id;
  }

  return prisma.hotspot.update({ where: { id: hotspotId }, data: updateData });
};

/**
 * Delete a hotspot.
 * SRS REQ-TOUR-AUTH-06 | §8.5
 */
const deleteHotspot = async (hotspotId, user) => {
  const hotspot = await prisma.hotspot.findUnique({
    where: { id: hotspotId },
    include: { scene: { include: { property: true } } },
  });

  if (!hotspot) throw new ApiError('Hotspot not found.', 404, 'HOTSPOT_NOT_FOUND');

  await verifySceneOwnership(hotspot.scene, user.id, user.role);

  await prisma.hotspot.delete({ where: { id: hotspotId } });
};

module.exports = { createHotspot, updateHotspot, deleteHotspot };
