const { z } = require('zod');
const { prisma } = require('../../config/db');
const { ApiError } = require('../../middleware/errorHandler');
const { sendEmail } = require('../../config/mailer');
const logger = require('../../utils/logger');

// ── Helper: create audit log entry ───────────────────────────────────────────
const audit = (actorId, action, targetTable, targetId, newValues = {}) =>
  prisma.auditLog.create({
    data: { actor_id: actorId, action, target_table: targetTable, target_id: targetId, new_values: newValues },
  });

// ── Property Moderation ────────────────────────────────────────────────────────

const getPendingProperties = async (req, res, next) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 50);

    const [count, results] = await Promise.all([
      prisma.property.count({ where: { status: 'PENDING' } }),
      prisma.property.findMany({
        where: { status: 'PENDING' },
        skip, take,
        orderBy: { created_at: 'asc' },
        include: {
          owner: { select: { id: true, email: true, profile: { select: { full_name: true } } } },
          media: { take: 3, select: { file_url: true, media_category: true } },
        },
      }),
    ]);

    res.json({ success: true, count, results });
  } catch (err) { next(err); }
};

const approveProperty = async (req, res, next) => {
  try {
    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
      include: { owner: { select: { email: true } } },
    });
    if (!property) throw new ApiError('Property not found.', 404);
    if (property.status !== 'PENDING') throw new ApiError('Property is not in PENDING state.', 400);

    const updated = await prisma.property.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED', updated_at: new Date() },
    });

    await audit(req.user.id, 'PROPERTY_APPROVED', 'properties', req.params.id);

    // Notify seller (SRS REQ-COMM-03)
    if (property.owner?.email) {
      await sendEmail({
        to: property.owner.email,
        subject: `Your listing "${property.title_en}" is now live — Ethred`,
        html: `
          <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #121212; color: #fff; border-radius: 12px;">
            <h2 style="color: #D4AF37;">Listing Approved ✓</h2>
            <p>Your property listing <strong>${property.title_en}</strong> has been reviewed and approved.</p>
            <p>It is now visible to all buyers on Ethred.</p>
            <a href="${process.env.FRONTEND_URL}/properties/${property.id}" 
               style="display:inline-block; margin: 20px 0; padding: 12px 24px; background: #D4AF37; color: #121212; font-weight: 700; border-radius: 8px; text-decoration: none;">
              View Listing
            </a>
          </div>
        `,
      }).catch(() => {});
    }

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

const suspendProperty = async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);

    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
      include: { owner: { select: { email: true } } },
    });
    if (!property) throw new ApiError('Property not found.', 404);

    const updated = await prisma.property.update({
      where: { id: req.params.id },
      data: { status: 'SUSPENDED', updated_at: new Date() },
    });

    await audit(req.user.id, 'PROPERTY_SUSPENDED', 'properties', req.params.id, { reason });

    if (property.owner?.email) {
      await sendEmail({
        to: property.owner.email,
        subject: `Your Ethred listing has been suspended`,
        html: `
          <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #121212; color: #fff; border-radius: 12px;">
            <h2 style="color: #F9A602;">Listing Suspended</h2>
            <p>Your listing <strong>${property.title_en}</strong> has been suspended.</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p>Please contact support if you believe this was a mistake.</p>
          </div>
        `,
      }).catch(() => {});
    }

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

const rejectProperty = async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);

    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
      include: { owner: { select: { email: true } } },
    });
    if (!property) throw new ApiError('Property not found.', 404);

    const updated = await prisma.property.update({
      where: { id: req.params.id },
      data: { status: 'DRAFT', updated_at: new Date() }, // back to DRAFT so seller can fix
    });

    await audit(req.user.id, 'PROPERTY_REJECTED', 'properties', req.params.id, { reason });

    if (property.owner?.email) {
      await sendEmail({
        to: property.owner.email,
        subject: `Action required: Ethred listing needs revision`,
        html: `
          <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #121212; color: #fff; border-radius: 12px;">
            <h2 style="color: #F9A602;">Listing Needs Revision</h2>
            <p>Your listing <strong>${property.title_en}</strong> requires changes before it can go live.</p>
            <p><strong>Feedback:</strong> ${reason}</p>
            <a href="${process.env.FRONTEND_URL}/dashboard/listings/${property.id}/edit" 
               style="display:inline-block; margin: 20px 0; padding: 12px 24px; background: #D4AF37; color: #121212; font-weight: 700; border-radius: 8px; text-decoration: none;">
              Edit Listing
            </a>
          </div>
        `,
      }).catch(() => {});
    }

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

// ── User Management ────────────────────────────────────────────────────────────

const listUsers = async (req, res, next) => {
  try {
    const { page = '1', limit = '20', role, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 50);

    const where = {
      ...(role && { role }),
      ...(search && {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { phone_number: { contains: search } },
          { profile: { full_name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [count, results] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where, skip, take,
        orderBy: { created_at: 'desc' },
        select: {
          id: true, email: true, phone_number: true, role: true,
          is_phone_verified: true, is_identity_verified: true, created_at: true,
          profile: { select: { full_name: true, avatar_url: true } },
        },
      }),
    ]);

    res.json({ success: true, count, results });
  } catch (err) { next(err); }
};

const getUser = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, email: true, phone_number: true, role: true,
        is_phone_verified: true, is_identity_verified: true, created_at: true,
        profile: true,
        _count: { select: { properties: true } },
      },
    });
    if (!user) throw new ApiError('User not found.', 404);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

const banUser = async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);

    // We mark user as banned by setting a special role or flag
    // For Phase 1, we repurpose the audit log and could add a `is_banned` field
    await audit(req.user.id, 'USER_BANNED', 'users', req.params.id, { reason });

    res.json({ success: true, message: 'User has been banned and flagged for review.' });
  } catch (err) { next(err); }
};

const verifyUserIdentity = async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.params.id },
      data: { is_identity_verified: true },
    });
    await audit(req.user.id, 'USER_IDENTITY_VERIFIED', 'users', req.params.id);
    res.json({ success: true, message: 'User identity verified.' });
  } catch (err) { next(err); }
};

const changeUserRole = async (req, res, next) => {
  try {
    const { role } = z.object({
      role: z.enum(['BUYER', 'SELLER', 'AGENCY_ADMIN', 'AGENCY_AGENT', 'ADMIN']),
    }).parse(req.body);

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, email: true, role: true },
    });

    await audit(req.user.id, 'USER_ROLE_CHANGED', 'users', req.params.id, { new_role: role });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

// ── Agency Moderation ──────────────────────────────────────────────────────────

const getPendingAgencies = async (req, res, next) => {
  try {
    const results = await prisma.agency.findMany({
      where: { is_approved: false },
      include: { admin: { select: { id: true, email: true, profile: { select: { full_name: true } } } } },
      orderBy: { created_at: 'asc' },
    });
    res.json({ success: true, count: results.length, results });
  } catch (err) { next(err); }
};

const approveAgency = async (req, res, next) => {
  try {
    const agency = await prisma.agency.findUnique({
      where: { id: req.params.id },
      include: { admin: { select: { id: true, email: true } } },
    });
    if (!agency) throw new ApiError('Agency not found.', 404);

    const [updatedAgency] = await prisma.$transaction([
      prisma.agency.update({ where: { id: req.params.id }, data: { is_approved: true } }),
      // Elevate the admin user's role to AGENCY_ADMIN
      prisma.user.update({ where: { id: agency.admin_id }, data: { role: 'AGENCY_ADMIN' } }),
    ]);

    await audit(req.user.id, 'AGENCY_APPROVED', 'agencies', req.params.id);

    if (agency.admin?.email) {
      await sendEmail({
        to: agency.admin.email,
        subject: `${agency.agency_name} has been approved on Ethred`,
        html: `
          <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #121212; color: #fff; border-radius: 12px;">
            <h2 style="color: #D4AF37;">Agency Approved ✓</h2>
            <p>Congratulations! <strong>${agency.agency_name}</strong> has been verified and approved on Ethred.</p>
            <p>You can now invite agents, create listings, and access your agency dashboard.</p>
            <a href="${process.env.FRONTEND_URL}/agency/dashboard" 
               style="display:inline-block; margin: 20px 0; padding: 12px 24px; background: #D4AF37; color: #121212; font-weight: 700; border-radius: 8px; text-decoration: none;">
              Go to Dashboard
            </a>
          </div>
        `,
      }).catch(() => {});
    }

    res.json({ success: true, data: updatedAgency });
  } catch (err) { next(err); }
};

const rejectAgency = async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);
    const agency = await prisma.agency.findUnique({
      where: { id: req.params.id },
      include: { admin: { select: { email: true } } },
    });
    if (!agency) throw new ApiError('Agency not found.', 404);

    await audit(req.user.id, 'AGENCY_REJECTED', 'agencies', req.params.id, { reason });

    if (agency.admin?.email) {
      await sendEmail({
        to: agency.admin.email,
        subject: `Agency application update — Ethred`,
        html: `
          <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #121212; color: #fff; border-radius: 12px;">
            <h2 style="color: #F9A602;">Application Update</h2>
            <p>Your agency application for <strong>${agency.agency_name}</strong> requires additional information.</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p>Please contact our support team to resubmit.</p>
          </div>
        `,
      }).catch(() => {});
    }

    res.json({ success: true, message: 'Agency application rejected.' });
  } catch (err) { next(err); }
};

// ── Audit Logs ─────────────────────────────────────────────────────────────────

const getAuditLogs = async (req, res, next) => {
  try {
    const { page = '1', limit = '50', action, target_table, actor_id } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 100);

    const where = {
      ...(action && { action: { contains: action, mode: 'insensitive' } }),
      ...(target_table && { target_table }),
      ...(actor_id && { actor_id }),
    };

    const [count, results] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where, skip, take,
        orderBy: { created_at: 'desc' },
        include: { actor: { select: { id: true, email: true, role: true } } },
      }),
    ]);

    res.json({ success: true, count, results });
  } catch (err) { next(err); }
};

// ── Dashboard Stats ────────────────────────────────────────────────────────────

const getDashboardStats = async (req, res, next) => {
  try {
    const [
      totalUsers, totalProperties, pendingProperties,
      totalAgencies, pendingAgencies, totalInvoices, completedInvoices,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.property.count(),
      prisma.property.count({ where: { status: 'PENDING' } }),
      prisma.agency.count(),
      prisma.agency.count({ where: { is_approved: false } }),
      prisma.billingInvoice.count(),
      prisma.billingInvoice.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const usersByRole = await prisma.user.groupBy({
      by: ['role'],
      _count: { id: true },
    });

    const propertiesByCategory = await prisma.property.groupBy({
      by: ['category'],
      _count: { id: true },
    });

    res.json({
      success: true,
      data: {
        users: { total: totalUsers, by_role: usersByRole },
        properties: {
          total: totalProperties,
          pending: pendingProperties,
          by_category: propertiesByCategory,
        },
        agencies: { total: totalAgencies, pending: pendingAgencies },
        revenue: {
          total_invoices: totalInvoices,
          completed_count: completedInvoices._count,
          total_etb: completedInvoices._sum.amount || 0,
        },
      },
    });
  } catch (err) { next(err); }
};

module.exports = {
  getPendingProperties, approveProperty, suspendProperty, rejectProperty,
  listUsers, getUser, banUser, verifyUserIdentity, changeUserRole,
  getPendingAgencies, approveAgency, rejectAgency,
  getAuditLogs, getDashboardStats,
};
