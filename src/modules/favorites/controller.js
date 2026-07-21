const { prisma } = require('../../config/db');
const { ApiError } = require('../../middleware/errorHandler');

const addFavorite = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new ApiError('Property not found.', 404);

    await prisma.userFavorite.upsert({
      where: { user_id_property_id: { user_id: req.user.id, property_id: propertyId } },
      create: { user_id: req.user.id, property_id: propertyId },
      update: {},
    });

    res.status(201).json({ success: true, message: 'Added to favorites.' });
  } catch (err) { next(err); }
};

const removeFavorite = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    await prisma.userFavorite.deleteMany({
      where: { user_id: req.user.id, property_id: propertyId },
    });
    res.json({ success: true, message: 'Removed from favorites.' });
  } catch (err) { next(err); }
};

const listFavorites = async (req, res, next) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 50);

    const [count, favorites] = await Promise.all([
      prisma.userFavorite.count({ where: { user_id: req.user.id } }),
      prisma.userFavorite.findMany({
        where: { user_id: req.user.id },
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: {
          property: {
            select: {
              id: true, title_en: true, price_etb: true, category: true,
              city: true, sub_city: true, status: true,
              media: { take: 1, select: { file_url: true } },
            },
          },
        },
      }),
    ]);

    res.json({ success: true, count, page: parseInt(page), limit: take, results: favorites });
  } catch (err) { next(err); }
};

module.exports = { addFavorite, removeFavorite, listFavorites };
