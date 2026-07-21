const { z } = require('zod');
const { prisma } = require('../../config/db');
const { ApiError } = require('../../middleware/errorHandler');
const { sendEmail } = require('../../config/mailer');

const createInquirySchema = z.object({
  property_id: z.string().uuid(),
  message: z.string().min(5).max(2000),
});

const createInquiry = async (req, res, next) => {
  try {
    const { property_id, message } = createInquirySchema.parse(req.body);

    const property = await prisma.property.findUnique({
      where: { id: property_id },
      include: { owner: { select: { email: true, profile: { select: { full_name: true } } } } },
    });
    if (!property) throw new ApiError('Property not found.', 404);
    if (property.status !== 'APPROVED') throw new ApiError('This listing is not currently active.', 400);

    const inquiry = await prisma.propertyInquiry.create({
      data: { property_id, buyer_id: req.user.id, message, status: 'NEW' },
    });

    // Notify the property owner via email (SRS REQ-COMM-03)
    if (property.owner?.email) {
      await sendEmail({
        to: property.owner.email,
        subject: `New inquiry on "${property.title_en}" — Ethred`,
        html: `
          <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #121212; color: #fff; border-radius: 12px;">
            <h2 style="color: #D4AF37;">New Inquiry</h2>
            <p>Hi ${property.owner.profile?.full_name || 'there'},</p>
            <p>You have a new buyer message on <strong>${property.title_en}</strong>:</p>
            <blockquote style="border-left: 3px solid #D4AF37; padding-left: 16px; color: #ccc; margin: 20px 0;">
              ${message}
            </blockquote>
            <a href="${process.env.FRONTEND_URL}/dashboard/inquiries/${inquiry.id}" 
               style="display:inline-block; padding: 12px 24px; background: #D4AF37; color: #121212; font-weight: 700; border-radius: 8px; text-decoration: none;">
              View Inquiry
            </a>
          </div>
        `,
      }).catch(() => {}); // Non-blocking — don't fail the request if email fails
    }

    res.status(201).json({ success: true, data: inquiry });
  } catch (err) { next(err); }
};

const getMyInquiries = async (req, res, next) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 50);

    const [count, results] = await Promise.all([
      prisma.propertyInquiry.count({ where: { buyer_id: req.user.id } }),
      prisma.propertyInquiry.findMany({
        where: { buyer_id: req.user.id },
        skip, take,
        orderBy: { created_at: 'desc' },
        include: { property: { select: { id: true, title_en: true, city: true, sub_city: true } } },
      }),
    ]);

    res.json({ success: true, count, results });
  } catch (err) { next(err); }
};

const getReceivedInquiries = async (req, res, next) => {
  try {
    const { page = '1', limit = '20', status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 50);

    const where = {
      property: { owner_id: req.user.id },
      ...(status && { status }),
    };

    const [count, results] = await Promise.all([
      prisma.propertyInquiry.count({ where }),
      prisma.propertyInquiry.findMany({
        where, skip, take,
        orderBy: { created_at: 'desc' },
        include: {
          property: { select: { id: true, title_en: true } },
          buyer: { select: { id: true, email: true, profile: { select: { full_name: true, avatar_url: true } } } },
        },
      }),
    ]);

    res.json({ success: true, count, results });
  } catch (err) { next(err); }
};

const getInquiry = async (req, res, next) => {
  try {
    const inquiry = await prisma.propertyInquiry.findUnique({
      where: { id: req.params.id },
      include: {
        property: { select: { id: true, title_en: true, owner_id: true } },
        buyer: { select: { id: true, email: true, profile: { select: { full_name: true } } } },
      },
    });
    if (!inquiry) throw new ApiError('Inquiry not found.', 404);

    // Only buyer or property owner can view
    const isOwner = inquiry.property.owner_id === req.user.id;
    const isBuyer = inquiry.buyer_id === req.user.id;
    if (!isOwner && !isBuyer && req.user.role !== 'ADMIN') throw new ApiError('Forbidden.', 403);

    res.json({ success: true, data: inquiry });
  } catch (err) { next(err); }
};

const updateStatus = async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED']) }).parse(req.body);

    const inquiry = await prisma.propertyInquiry.findUnique({
      where: { id: req.params.id },
      include: { property: true },
    });
    if (!inquiry) throw new ApiError('Inquiry not found.', 404);
    if (inquiry.property.owner_id !== req.user.id && req.user.role !== 'ADMIN') throw new ApiError('Forbidden.', 403);

    const updated = await prisma.propertyInquiry.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

/**
 * Scam / duplicate listing report — SRS REQ-VERI-03
 * Auto-suspend listing if 3+ independent flags received
 */
const reportListing = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    const { reason } = z.object({ reason: z.string().min(5).max(500) }).parse(req.body);

    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new ApiError('Property not found.', 404);

    // Log the report as an audit entry
    await prisma.auditLog.create({
      data: {
        actor_id: req.user.id,
        action: 'LISTING_REPORTED',
        target_table: 'properties',
        target_id: propertyId,
        new_values: { reason },
      },
    });

    // Count total reports for this property
    const reportCount = await prisma.auditLog.count({
      where: { action: 'LISTING_REPORTED', target_table: 'properties', target_id: propertyId },
    });

    // Auto-suspend after 3+ unique flags (SRS REQ-VERI-03)
    if (reportCount >= 3 && property.status === 'APPROVED') {
      await prisma.property.update({
        where: { id: propertyId },
        data: { status: 'SUSPENDED' },
      });
      await prisma.auditLog.create({
        data: {
          actor_id: null,
          action: 'LISTING_AUTO_SUSPENDED',
          target_table: 'properties',
          target_id: propertyId,
          new_values: { reason: `Auto-suspended after ${reportCount} reports` },
        },
      });
    }

    res.json({ success: true, message: 'Report submitted. Our team will review this listing.' });
  } catch (err) { next(err); }
};

module.exports = { createInquiry, getMyInquiries, getReceivedInquiries, getInquiry, updateStatus, reportListing };
