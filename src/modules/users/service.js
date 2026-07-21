const { z } = require('zod');
const { prisma } = require('../../config/db');
const { ApiError } = require('../../middleware/errorHandler');

const updateProfileSchema = z.object({
  full_name: z.string().min(2).max(150).optional(),
  preferred_language: z.enum(['en', 'am']).optional(),
  phone_number: z.string().optional(),
  email: z.string().email().optional(),
}).strict();

const getProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!user) throw new ApiError('User not found.', 404);

  const { password_hash, ...safeUser } = user;
  return safeUser;
};

const updateProfile = async (userId, body) => {
  const data = updateProfileSchema.parse(body);
  const { full_name, preferred_language, phone_number, email } = data;

  const userUpdates = {};
  if (phone_number) userUpdates.phone_number = phone_number;
  if (email) userUpdates.email = email;

  const profileUpdates = {};
  if (full_name) profileUpdates.full_name = full_name;
  if (preferred_language) profileUpdates.preferred_language = preferred_language;

  const [, profile] = await prisma.$transaction([
    Object.keys(userUpdates).length
      ? prisma.user.update({ where: { id: userId }, data: userUpdates })
      : prisma.$queryRaw`SELECT 1`,
    prisma.profile.update({ where: { user_id: userId }, data: profileUpdates, select: { full_name: true, preferred_language: true, avatar_url: true } }),
  ]);

  return profile;
};

const updateAvatar = async (userId, avatar_url) => {
  return prisma.profile.update({
    where: { user_id: userId },
    data: { avatar_url },
    select: { avatar_url: true },
  });
};

const saveIdDocument = async (userId, documentUrl) => {
  // Store in a dedicated id_verification_documents table or as a field
  // For Phase 1 we create an audit log and flag the user for review
  await prisma.auditLog.create({
    data: {
      actor_id: userId,
      action: 'ID_DOCUMENT_UPLOADED',
      target_table: 'users',
      target_id: userId,
      new_values: { document_url: documentUrl },
    },
  });
  // The ADMIN will verify and set is_identity_verified = true
};

const updateNotificationPrefs = async (userId, body) => {
  const schema = z.object({
    email_notifications: z.boolean().optional(),
    sms_notifications: z.boolean().optional(),
    push_notifications: z.boolean().optional(),
  });
  const prefs = schema.parse(body);
  // Store in profile as JSON (extend Prisma schema as needed)
  return prefs;
};

module.exports = { getProfile, updateProfile, updateAvatar, saveIdDocument, updateNotificationPrefs };
