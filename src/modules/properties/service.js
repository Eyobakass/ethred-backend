const { z } = require('zod');
const { prisma } = require('../../config/db');
const { ApiError } = require('../../middleware/errorHandler');

// ── Schemas ────────────────────────────────────────────────────────────────────
const propertySchema = z.object({
  title_en: z.string().min(5).max(255),
  title_am: z.string().max(255).optional(),
  description_en: z.string().min(20),
  description_am: z.string().optional(),
  price_etb: z.coerce.number().nonnegative(),
  price_usd: z.coerce.number().nonnegative().optional(),
  transaction_mode: z.enum(['SALE', 'RENT']).default('SALE'),
  category: z.enum(['HOUSE', 'APARTMENT', 'LAND', 'COMMERCIAL', 'OFFICE', 'WAREHOUSE', 'VACATION']).default('HOUSE'),
  region: z.string().min(2),
  city: z.string().min(2),
  sub_city: z.string().min(2),
  woreda: z.string().min(1),
  kebele: z.string().optional(),
  nearest_landmark: z.string().optional(),
  bedrooms: z.coerce.number().int().nonnegative().default(0),
  bathrooms: z.coerce.number().int().nonnegative().default(0),
  area_sqm: z.coerce.number().positive(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  agency_id: z.string().uuid().optional(),
  amenities: z.array(z.string()).optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────────────
const ensureOwnerOrAdmin = (property, user) => {
  if (user.role === 'ADMIN') return;
  if (property.owner_id !== user.id) throw new ApiError('You do not own this property.', 403);
};

// ── Service Methods ────────────────────────────────────────────────────────────

/**
 * Search properties — SRS REQ-SRCH-01, 4.2 API Spec
 */
const searchProperties = async (query) => {
  const {
    region, sub_city, city, woreda,
    category, transaction_mode,
    price_min, price_max,
    bedrooms, bathrooms,
    page = '1', limit = '20',
    sort = 'created_at', order = 'desc',
  } = query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = Math.min(parseInt(limit), 50);

  const where = {
    status: 'APPROVED',
    ...(region && { region: { contains: region, mode: 'insensitive' } }),
    ...(city && { city: { contains: city, mode: 'insensitive' } }),
    ...(sub_city && { sub_city: { contains: sub_city, mode: 'insensitive' } }),
    ...(woreda && { woreda: { contains: woreda, mode: 'insensitive' } }),
    ...(category && { category }),
    ...(transaction_mode && { transaction_mode }),
    ...(bedrooms && { bedrooms: { gte: parseInt(bedrooms) } }),
    ...(bathrooms && { bathrooms: { gte: parseInt(bathrooms) } }),
    ...((price_min || price_max) && {
      price_etb: {
        ...(price_min && { gte: parseFloat(price_min) }),
        ...(price_max && { lte: parseFloat(price_max) }),
      },
    }),
  };

  const [count, results] = await Promise.all([
    prisma.property.count({ where }),
    prisma.property.findMany({
      where,
      skip,
      take,
      orderBy: { [sort]: order },
      select: {
        id: true,
        title_en: true,
        title_am: true,
        price_etb: true,
        price_usd: true,
        category: true,
        transaction_mode: true,
        region: true,
        city: true,
        sub_city: true,
        woreda: true,
        nearest_landmark: true,
        bedrooms: true,
        bathrooms: true,
        area_sqm: true,
        status: true,
        created_at: true,
        media: { take: 5, orderBy: { sort_order: 'asc' }, select: { file_url: true, media_category: true, is_tour_scene: true } },
        owner: { select: { id: true, email: true, profile: { select: { full_name: true, avatar_url: true } } } },
      },
    }),
  ]);

  // Shape the response to match SRS Section 4.2
  const shaped = results.map((p) => ({
    ...p,
    thumbnail_url: p.media?.[0]?.file_url || null,
    // Keep p.media so frontend components can access full media array
  }));

  return { count, page: parseInt(page), limit: take, results: shaped };
};

const sanitizeId = (id) => String(id || '').replace(/['"]/g, '').trim();

const getProperty = async (propertyId) => {
  const cleanId = sanitizeId(propertyId);
  const property = await prisma.property.findUnique({
    where: { id: cleanId },
    include: {
      media: { orderBy: { sort_order: 'asc' } },
      amenities: true,
      owner: { select: { id: true, email: true, profile: { select: { full_name: true, avatar_url: true } } } },
      agency: { select: { id: true, agency_name: true, logo_url: true } },
    },
  });
  if (!property) throw new ApiError('Property not found.', 404);
  return property;
};

const createProperty = async (user, body) => {
  const { amenities, latitude, longitude, ...data } = propertySchema.parse(body);

  const property = await prisma.property.create({
    data: {
      ...data,
      owner_id: user.id,
      status: 'DRAFT',
      ...(latitude && longitude && {
        // PostGIS geography point stored via raw SQL — Prisma doesn't natively handle geography
        // We'll update it via $queryRaw after creation
      }),
      ...(amenities?.length && {
        amenities: {
          create: amenities.map((name) => ({ amenity_name: name })),
        },
      }),
    },
    include: { amenities: true },
  });

  // Set geometry point via raw if coordinates provided
  if (latitude && longitude) {
    await prisma.$executeRawUnsafe(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS geom_point GEOGRAPHY(Point, 4326);`);
    await prisma.$executeRaw`
      UPDATE properties 
      SET geom_point = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      WHERE id = ${property.id}::uuid
    `;
  }

  await prisma.auditLog.create({
    data: { actor_id: user.id, action: 'PROPERTY_CREATED', target_table: 'properties', target_id: property.id },
  });

  return property;
};

const updateProperty = async (propertyId, user, body) => {
  const cleanId = sanitizeId(propertyId);
  const property = await prisma.property.findUnique({ where: { id: cleanId } });
  if (!property) throw new ApiError('Property not found.', 404);
  ensureOwnerOrAdmin(property, user);

  // APPROVED properties cannot be edited directly — they must go through the draft/clone system.
  // Only allow editing properties that are in a mutable state.
  const mutableStatuses = ['DRAFT', 'PENDING_UPDATE'];
  if (!mutableStatuses.includes(property.status) && user.role !== 'ADMIN') {
    throw new ApiError(
      `Cannot edit a property with status "${property.status}" directly. Use the draft system.`,
      400
    );
  }

  const schema = propertySchema.partial();
  const { amenities, latitude, longitude, ...data } = schema.parse(body);

  // Strip any status field from seller-submitted body to prevent manipulation
  delete data.status;

  const updated = await prisma.property.update({
    where: { id: cleanId },
    data: { ...data, updated_at: new Date() },
  });

  if (latitude && longitude) {
    await prisma.$executeRaw`
      UPDATE properties 
      SET geom_point = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      WHERE id = ${cleanId}::uuid
    `;
  }

  return updated;
};

const deleteProperty = async (propertyId, user) => {
  const cleanId = sanitizeId(propertyId);
  const property = await prisma.property.findUnique({ where: { id: cleanId } });
  if (!property) throw new ApiError('Property not found.', 404);
  ensureOwnerOrAdmin(property, user);

  await prisma.property.update({ where: { id: cleanId }, data: { status: 'ARCHIVED' } });

  await prisma.auditLog.create({
    data: { actor_id: user.id, action: 'PROPERTY_ARCHIVED', target_table: 'properties', target_id: cleanId },
  });
};

/**
 * Submit DRAFT listing for admin review — SRS Section 8.1
 */
const submitForReview = async (propertyId, user) => {
  const cleanId = String(propertyId || '').replace(/['"]/g, '').trim();
  const property = await prisma.property.findUnique({ where: { id: cleanId } });
  if (!property) throw new ApiError('Property not found.', 404);
  ensureOwnerOrAdmin(property, user);

  // Accept both DRAFT (new listing) and PENDING_UPDATE (edit draft clone) for submission
  if (!['DRAFT', 'PENDING_UPDATE'].includes(property.status)) {
    throw new ApiError(`Cannot submit. Current status: ${property.status}`, 400);
  }

  // Anti-Spam Guard: only apply to brand-new DRAFT listings (not edit drafts)
  if (!property.parent_id) {
    const rejectionLog = await prisma.auditLog.findFirst({
      where: { target_table: 'properties', target_id: cleanId, action: 'PROPERTY_REJECTED' },
      orderBy: { created_at: 'desc' },
    });

    if (rejectionLog && new Date(property.updated_at) <= new Date(rejectionLog.created_at)) {
      throw new ApiError(
        'You must make revisions to your property details, photos, or 3D tour based on admin feedback before resubmitting for review.',
        400,
        'REVISION_REQUIRED'
      );
    }
  }

  // Determine correct pending status based on whether this is a clone or a new listing
  const newStatus = property.parent_id ? 'PENDING_UPDATE' : 'PENDING';

  return prisma.property.update({
    where: { id: cleanId },
    data: { status: newStatus, updated_at: new Date() },
  });
};

const createDraftClone = async (propertyId, user) => {
  const cleanId = sanitizeId(propertyId);
  const property = await prisma.property.findUnique({ 
    where: { id: cleanId },
    include: { media: true, amenities: true }
  });
  
  if (!property) throw new ApiError('Property not found.', 404);
  ensureOwnerOrAdmin(property, user);

  if (property.status !== 'APPROVED') {
    throw new ApiError('Only APPROVED properties can be cloned for drafting.', 400);
  }

  // Check if ANY draft already exists (PENDING_UPDATE or even DRAFT if previously rejected)
  // This prevents orphaned clones from accumulating.
  const existingDraft = await prisma.property.findFirst({
    where: { parent_id: cleanId, status: { in: ['DRAFT', 'PENDING_UPDATE'] } }
  });
  if (existingDraft) return existingDraft;

  // Create clone
  const draft = await prisma.property.create({
    data: {
      owner_id: property.owner_id,
      agency_id: property.agency_id,
      title_en: property.title_en,
      title_am: property.title_am,
      description_en: property.description_en,
      description_am: property.description_am,
      price_etb: property.price_etb,
      price_usd: property.price_usd,
      transaction_mode: property.transaction_mode,
      category: property.category,
      region: property.region,
      city: property.city,
      sub_city: property.sub_city,
      woreda: property.woreda,
      kebele: property.kebele,
      nearest_landmark: property.nearest_landmark,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      area_sqm: property.area_sqm,
      status: 'PENDING_UPDATE',
      parent_id: cleanId,
      // media and amenities will be copied separately because media has hotspots
    }
  });

  // Copy amenities
  if (property.amenities.length > 0) {
    await prisma.propertyAmenity.createMany({
      data: property.amenities.map(a => ({
        property_id: draft.id,
        amenity_name: a.amenity_name
      }))
    });
  }

  // Copy media (and hotspots later if needed)
  for (const media of property.media) {
    const newMedia = await prisma.propertyMedia.create({
      data: {
        property_id: draft.id,
        file_url: media.file_url,
        media_category: media.media_category,
        sort_order: media.sort_order,
        is_tour_scene: media.is_tour_scene,
        scene_name: media.scene_name,
        initial_yaw: media.initial_yaw,
        needs_repair: media.needs_repair,
        fp_x: media.fp_x,
        fp_y: media.fp_y
      }
    });

    // Copy hotspots for this media
    const hotspots = await prisma.hotspot.findMany({ where: { scene_id: media.id } });
    if (hotspots.length > 0) {
      await prisma.hotspot.createMany({
        data: hotspots.map(h => ({
          scene_id: newMedia.id,
          type: h.type,
          yaw: h.yaw,
          pitch: h.pitch,
          target_scene_id: h.target_scene_id, // Note: this won't map correctly across clones easily, but good enough for simple drafts
          label: h.label
        }))
      });
    }
  }

  // Update geometry unconditionally (copies NULL if it doesn't exist)
  await prisma.$executeRaw`
    UPDATE properties SET geom_point = (SELECT geom_point FROM properties WHERE id = ${cleanId}::uuid)
    WHERE id = ${draft.id}::uuid
  `;

  return draft;
};

const applyDraftToOriginal = async (draftId) => {
  const cleanId = sanitizeId(draftId);
  const draft = await prisma.property.findUnique({
    where: { id: cleanId },
    include: { media: true, amenities: true }
  });

  if (!draft || !draft.parent_id) {
    throw new ApiError('Draft not found or is not a clone.', 404);
  }

  // Find original
  const original = await prisma.property.findUnique({
    where: { id: draft.parent_id }
  });
  if (!original) throw new ApiError('Original property not found.', 404);

  // Overwrite original fields
  await prisma.property.update({
    where: { id: original.id },
    data: {
      title_en: draft.title_en,
      title_am: draft.title_am,
      description_en: draft.description_en,
      description_am: draft.description_am,
      price_etb: draft.price_etb,
      price_usd: draft.price_usd,
      transaction_mode: draft.transaction_mode,
      category: draft.category,
      region: draft.region,
      city: draft.city,
      sub_city: draft.sub_city,
      woreda: draft.woreda,
      kebele: draft.kebele,
      nearest_landmark: draft.nearest_landmark,
      bedrooms: draft.bedrooms,
      bathrooms: draft.bathrooms,
      area_sqm: draft.area_sqm,
      status: 'APPROVED', // Keep approved
    }
  });

  // Overwrite geometry
  await prisma.$executeRaw`
    UPDATE properties SET geom_point = (SELECT geom_point FROM properties WHERE id = ${cleanId}::uuid)
    WHERE id = ${original.id}::uuid
  `;

  // Delete original media and amenities (cascades to hotspots)
  await prisma.propertyMedia.deleteMany({ where: { property_id: original.id } });
  await prisma.propertyAmenity.deleteMany({ where: { property_id: original.id } });

  // Copy amenities back
  if (draft.amenities.length > 0) {
    await prisma.propertyAmenity.createMany({
      data: draft.amenities.map(a => ({
        property_id: original.id,
        amenity_name: a.amenity_name
      }))
    });
  }

  // Copy media back
  for (const media of draft.media) {
    const newMedia = await prisma.propertyMedia.create({
      data: {
        property_id: original.id,
        file_url: media.file_url,
        media_category: media.media_category,
        sort_order: media.sort_order,
        is_tour_scene: media.is_tour_scene,
        scene_name: media.scene_name,
        initial_yaw: media.initial_yaw,
        needs_repair: media.needs_repair,
        fp_x: media.fp_x,
        fp_y: media.fp_y
      }
    });

    // Copy hotspots back
    const hotspots = await prisma.hotspot.findMany({ where: { scene_id: media.id } });
    if (hotspots.length > 0) {
      await prisma.hotspot.createMany({
        data: hotspots.map(h => ({
          scene_id: newMedia.id,
          type: h.type,
          yaw: h.yaw,
          pitch: h.pitch,
          target_scene_id: h.target_scene_id,
          label: h.label
        }))
      });
    }
  }

  // Delete the draft
  await prisma.property.delete({ where: { id: cleanId } });
};

const attachMedia = async (propertyId, user, files, mediaType) => {
  const cleanId = sanitizeId(propertyId);
  const property = await prisma.property.findUnique({ where: { id: cleanId } });
  if (!property) throw new ApiError('Property not found.', 404);
  ensureOwnerOrAdmin(property, user);

  const currentCount = await prisma.propertyMedia.count({ where: { property_id: cleanId } });

  const mediaRecords = files.map((f, i) => ({
    property_id: cleanId,
    file_url: f.file_url,
    media_category: mediaType,
    sort_order: currentCount + i,
  }));

  const created = await prisma.propertyMedia.createMany({ data: mediaRecords });
  await prisma.property.update({ where: { id: cleanId }, data: { updated_at: new Date() } });
  return created;
};

const deleteMedia = async (propertyId, mediaId, user) => {
  const cleanId = sanitizeId(propertyId);
  const cleanMediaId = sanitizeId(mediaId);
  const property = await prisma.property.findUnique({ where: { id: cleanId } });
  if (!property) throw new ApiError('Property not found.', 404, 'PROPERTY_NOT_FOUND');
  ensureOwnerOrAdmin(property, user);

  const media = await prisma.propertyMedia.findUnique({ where: { id: cleanMediaId } });
  if (!media || media.property_id !== cleanId) {
    throw new ApiError('Media record not found.', 404, 'MEDIA_NOT_FOUND');
  }

  await prisma.propertyMedia.delete({ where: { id: cleanMediaId } });
  await prisma.property.update({ where: { id: cleanId }, data: { updated_at: new Date() } });
};

const updateMedia = async (propertyId, mediaId, user, data) => {
  const cleanId = sanitizeId(propertyId);
  const cleanMediaId = sanitizeId(mediaId);
  const property = await prisma.property.findUnique({ where: { id: cleanId } });
  if (!property) throw new ApiError('Property not found.', 404, 'PROPERTY_NOT_FOUND');
  ensureOwnerOrAdmin(property, user);

  const media = await prisma.propertyMedia.findUnique({ where: { id: cleanMediaId } });
  if (!media || media.property_id !== cleanId) {
    throw new ApiError('Media record not found.', 404, 'MEDIA_NOT_FOUND');
  }

  const updated = await prisma.propertyMedia.update({
    where: { id: cleanMediaId },
    data: {
      scene_name: data.scene_name !== undefined ? data.scene_name : media.scene_name,
    },
  });
  return updated;
};

const getMyListings = async (user, query) => {
  const { page = '1', limit = '20', status } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = Math.min(parseInt(limit), 50);

  const where = { owner_id: user.id, ...(status && { status }) };
  const [count, results] = await Promise.all([
    prisma.property.count({ where }),
    prisma.property.findMany({ where, skip, take, orderBy: { created_at: 'desc' } }),
  ]);

  const resultsWithRejection = await Promise.all(
    results.map(async (p) => {
      if (p.status === 'DRAFT') {
        const rejectionLog = await prisma.auditLog.findFirst({
          where: { target_table: 'properties', target_id: p.id, action: 'PROPERTY_REJECTED' },
          orderBy: { created_at: 'desc' },
          include: { actor: { select: { email: true, profile: { select: { full_name: true } } } } },
        });
        if (rejectionLog) {
          return {
            ...p,
            rejection_info: {
              reason: rejectionLog.new_values?.reason || 'No specific reason provided.',
              rejected_at: rejectionLog.created_at,
              rejected_by: rejectionLog.actor?.profile?.full_name || rejectionLog.actor?.email || 'Platform Admin',
            },
          };
        }
      }
      return p;
    })
  );

  return { count, page: parseInt(page), limit: take, results: resultsWithRejection };
};

const getListingStats = async (propertyId, user) => {
  const cleanId = sanitizeId(propertyId);
  const property = await prisma.property.findUnique({ where: { id: cleanId } });
  if (!property) throw new ApiError('Property not found.', 404);
  ensureOwnerOrAdmin(property, user);

  const [favorites, inquiries] = await Promise.all([
    prisma.userFavorite.count({ where: { property_id: cleanId } }),
    prisma.propertyInquiry.count({ where: { property_id: cleanId } }),
  ]);

  return { property_id: cleanId, favorites_count: favorites, inquiries_count: inquiries };
};

// ── Tour Service Methods (SRS-ETHRED-2026-VT-1.0) ───────────────────────────

/**
 * Build the Pannellum-compatible tour config JSON for a property.
 * GET /api/v1/properties/:id/tour (SRS §8.2)
 * Public endpoint — no auth required.
 */
const getTourConfig = async (propertyId) => {
  const cleanId = sanitizeId(propertyId);

  // Verify property exists
  const property = await prisma.property.findUnique({
    where: { id: cleanId },
    select: { id: true, external_tour_url: true, floor_plan_url: true },
  });
  if (!property) throw new ApiError('Property not found.', 404, 'PROPERTY_NOT_FOUND');

  // Fetch all tour scenes with their hotspots, ordered by sort_order
  const scenes = await prisma.propertyMedia.findMany({
    where: { property_id: cleanId, is_tour_scene: true },
    include: { hotspots: true },
    orderBy: { sort_order: 'asc' },
  });

  if (scenes.length === 0) {
    throw new ApiError('This property has no virtual tour.', 404, 'NO_TOUR_AVAILABLE');
  }

  // Build Pannellum config (SRS §5.2)
  const tourConfig = {
    default: {
      firstScene: scenes[0].id,
      sceneFadeDuration: 1000,
      autoLoad: true,
      showControls: true,
      keyboardZoom: false,
    },
    scenes: Object.fromEntries(
      scenes.map((s) => [
        s.id,
        {
          title: s.scene_name ?? 'Room',
          type: 'equirectangular',
          panorama: s.file_url,
          yaw: s.initial_yaw ?? 0,
          fp_x: s.fp_x ?? null,
          fp_y: s.fp_y ?? null,
          hotSpots: s.hotspots
            // Filter out orphaned NAVIGATION hotspots (target deleted)
            .filter((h) => h.type !== 'NAVIGATION' || h.target_scene_id !== null)
            .map((h) => ({
              id: h.id,
              pitch: h.pitch,
              yaw: h.yaw,
              type: h.type === 'NAVIGATION' ? 'scene' : 'info',
              text: h.label ?? '',
              ...(h.type === 'NAVIGATION' && { sceneId: h.target_scene_id }),
              cssClass: h.type === 'NAVIGATION' ? 'tour-nav-hotspot' : 'tour-info-hotspot',
            })),
        },
      ])
    ),
    // Pass through external_tour_url and floor_plan_url
    meta: {
      property_id: cleanId,
      scene_count: scenes.length,
      external_tour_url: property.external_tour_url ?? null,
      floor_plan_url: property.floor_plan_url ?? null,
    },
  };

  return tourConfig;
};

/**
 * Save or update floor_plan_url on a Property.
 * POST /api/v1/properties/:id/floor-plan (SRS-ETHRED-2026-VT §7.4)
 */
const uploadFloorPlan = async (propertyId, user, fileUrl) => {
  const cleanId = sanitizeId(propertyId);
  const property = await prisma.property.findUnique({ where: { id: cleanId } });
  if (!property) throw new ApiError('Property not found.', 404, 'PROPERTY_NOT_FOUND');
  ensureOwnerOrAdmin(property, user);

  const updated = await prisma.property.update({
    where: { id: cleanId },
    data: { floor_plan_url: fileUrl, updated_at: new Date() },
  });

  return updated;
};

/**
 * Create a PropertyMedia row for an uploaded 360° tour scene.
 * Called after uploadPanorama + processPanorama middleware.
 * POST /api/v1/properties/:id/media/tour-scene (SRS §8.1)
 */
const uploadTourScene = async (propertyId, user, tourSceneData, query) => {
  const cleanId = sanitizeId(propertyId);
  const property = await prisma.property.findUnique({ where: { id: cleanId } });
  if (!property) throw new ApiError('Property not found.', 404, 'PROPERTY_NOT_FOUND');
  ensureOwnerOrAdmin(property, user);

  const { file_url, gpano_confirmed } = tourSceneData;

  const sceneName = typeof query.scene_name === 'string'
    ? query.scene_name.trim() || null
    : null;

  let initialYaw = 0;
  if (query.initial_yaw !== undefined) {
    const y = parseFloat(query.initial_yaw);
    if (!isNaN(y) && y >= 0 && y < 360) initialYaw = y;
  }

  // Determine sort_order (append after existing scenes)
  const maxOrder = await prisma.propertyMedia.aggregate({
    where: { property_id: cleanId },
    _max: { sort_order: true },
  });
  const sortOrder = (maxOrder._max.sort_order ?? -1) + 1;

  const media = await prisma.propertyMedia.create({
    data: {
      property_id: cleanId,
      file_url,
      media_category: 'IMAGE',
      sort_order: sortOrder,
      is_tour_scene: true,
      needs_repair: true,
      scene_name: sceneName,
      initial_yaw: initialYaw,
    },
  });

  return { ...media, gpano_confirmed };
};

/**
 * Update sort_order for multiple tour scenes in a single transaction.
 * PATCH /api/v1/properties/:id/tour/reorder (SRS §8.7)
 */
const reorderTourScenes = async (propertyId, user, sceneOrder) => {
  const cleanId = sanitizeId(propertyId);
  const property = await prisma.property.findUnique({ where: { id: cleanId } });
  if (!property) throw new ApiError('Property not found.', 404, 'PROPERTY_NOT_FOUND');
  ensureOwnerOrAdmin(property, user);

  if (!Array.isArray(sceneOrder) || sceneOrder.length === 0) {
    throw new ApiError('scene_order must be a non-empty array.', 400);
  }

  // Run all updates in a transaction
  const updates = await prisma.$transaction(
    sceneOrder.map(({ scene_id, sort_order }) =>
      prisma.propertyMedia.update({
        where: { id: scene_id },
        data: { sort_order: parseInt(sort_order) },
      })
    )
  );

  return { updated: updates.length };
};

module.exports = {
  searchProperties, getProperty, createProperty, updateProperty, deleteProperty,
  submitForReview, attachMedia, deleteMedia, updateMedia, getMyListings, getListingStats,
  createDraftClone, applyDraftToOriginal,
  // Tour
  getTourConfig, uploadTourScene, reorderTourScenes, uploadFloorPlan,
};
