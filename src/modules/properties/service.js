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
        media: { where: { sort_order: 0 }, take: 1, select: { file_url: true } },
        owner: { select: { id: true, email: true, profile: { select: { full_name: true, avatar_url: true } } } },
      },
    }),
  ]);

  // Shape the response to match SRS Section 4.2
  const shaped = results.map((p) => ({
    ...p,
    thumbnail_url: p.media[0]?.file_url || null,
    media: undefined,
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

  const schema = propertySchema.partial();
  const { amenities, latitude, longitude, ...data } = schema.parse(body);

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

  if (property.status !== 'DRAFT') {
    throw new ApiError(`Cannot submit. Current status: ${property.status}`, 400);
  }

  return prisma.property.update({
    where: { id: cleanId },
    data: { status: 'PENDING', updated_at: new Date() },
  });
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

  return prisma.propertyMedia.createMany({ data: mediaRecords });
};

const deleteMedia = async (propertyId, mediaId, user) => {
  const cleanId = sanitizeId(propertyId);
  const property = await prisma.property.findUnique({ where: { id: cleanId } });
  if (!property) throw new ApiError('Property not found.', 404);
  ensureOwnerOrAdmin(property, user);

  await prisma.propertyMedia.delete({ where: { id: mediaId } });
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

  return { count, page: parseInt(page), limit: take, results };
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

module.exports = {
  searchProperties, getProperty, createProperty, updateProperty, deleteProperty,
  submitForReview, attachMedia, deleteMedia, getMyListings, getListingStats,
};
