const { z } = require('zod');
const { prisma } = require('../../config/db');
const { sendEmail } = require('../../config/mailer');
const { ApiError } = require('../../middleware/errorHandler');

const createAgencySchema = z.object({
  agency_name: z.string().min(2).max(200),
  business_license_url: z.string(),
});

const createAgency = async (adminId, body) => {
  const { agency_name, business_license_url } = createAgencySchema.parse(body);

  const existing = await prisma.agency.findFirst({ where: { agency_name } });
  if (existing) throw new ApiError('An agency with this name already exists.', 409);

  const agency = await prisma.agency.create({
    data: {
      admin_id: adminId,
      agency_name,
      business_license_url,
      is_approved: false,
    },
  });

  // Log audit
  await prisma.auditLog.create({
    data: { actor_id: adminId, action: 'AGENCY_CREATED', target_table: 'agencies', target_id: agency.id },
  });

  return agency;
};

const getAgency = async (agencyId) => {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    include: {
      employees: {
        include: { user: { select: { id: true, email: true } } },
      },
    },
  });
  if (!agency) throw new ApiError('Agency not found.', 404);
  return agency;
};

const updateAgency = async (agencyId, requestingUser, body) => {
  const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!agency) throw new ApiError('Agency not found.', 404);

  if (requestingUser.role !== 'ADMIN' && agency.admin_id !== requestingUser.id) {
    throw new ApiError('Forbidden.', 403);
  }

  const schema = z.object({
    agency_name: z.string().min(2).max(200).optional(),
    logo_url: z.string().optional(),
  });
  const data = schema.parse(body);
  return prisma.agency.update({ where: { id: agencyId }, data });
};

const inviteEmployee = async (agencyId, requestingUser, body) => {
  const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!agency) throw new ApiError('Agency not found.', 404);
  if (requestingUser.role !== 'ADMIN' && agency.admin_id !== requestingUser.id) throw new ApiError('Forbidden.', 403);

  const { email } = z.object({ email: z.string().email() }).parse(body);

  const inviteLink = `${process.env.FRONTEND_URL}/agency/join?agency=${agencyId}&email=${encodeURIComponent(email)}`;

  await sendEmail({
    to: email,
    subject: `You're invited to join ${agency.agency_name} on Ethred`,
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #121212; color: #fff; border-radius: 12px;">
        <h2 style="color: #D4AF37;">${agency.agency_name}</h2>
        <p>You've been invited to join <strong>${agency.agency_name}</strong> as an agent on Ethred.</p>
        <a href="${inviteLink}" style="display:inline-block; margin: 20px 0; padding: 14px 28px; background: #D4AF37; color: #121212; font-weight: 700; border-radius: 8px; text-decoration: none;">Accept Invitation</a>
      </div>
    `,
  });
};

const listEmployees = async (agencyId, requestingUser) => {
  const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!agency) throw new ApiError('Agency not found.', 404);
  if (requestingUser.role !== 'ADMIN' && agency.admin_id !== requestingUser.id) throw new ApiError('Forbidden.', 403);

  return prisma.agencyEmployee.findMany({
    where: { agency_id: agencyId },
    include: { user: { select: { id: true, email: true, phone_number: true } } },
  });
};

const removeEmployee = async (agencyId, userId, requestingUser) => {
  const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!agency) throw new ApiError('Agency not found.', 404);
  if (requestingUser.role !== 'ADMIN' && agency.admin_id !== requestingUser.id) throw new ApiError('Forbidden.', 403);

  await prisma.agencyEmployee.deleteMany({ where: { agency_id: agencyId, user_id: userId } });
};

const getAnalytics = async (agencyId, requestingUser) => {
  const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!agency) throw new ApiError('Agency not found.', 404);
  if (requestingUser.role !== 'ADMIN' && agency.admin_id !== requestingUser.id) throw new ApiError('Forbidden.', 403);

  const employees = await prisma.agencyEmployee.findMany({ where: { agency_id: agencyId } });

  const stats = await prisma.property.groupBy({
    by: ['owner_id'],
    where: { agency_id: agencyId },
    _count: { id: true },
  });

  const totalListings = stats.reduce((sum, s) => sum + s._count.id, 0);
  const totalInquiries = await prisma.propertyInquiry.count({
    where: { property: { agency_id: agencyId } },
  });

  return { total_agents: employees.length, total_listings: totalListings, total_inquiries: totalInquiries, per_agent: stats };
};

module.exports = { createAgency, getAgency, updateAgency, inviteEmployee, listEmployees, removeEmployee, getAnalytics };
