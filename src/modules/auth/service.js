const { z } = require('zod');
const { prisma } = require('../../config/db');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../../utils/password');
const { createOTP, verifyOTP, sendEmailOTP } = require('../../utils/otp');
const { signToken, verifyToken } = require('../../utils/jwt');
const { sendEmail } = require('../../config/mailer');
const { ApiError } = require('../../middleware/errorHandler');
const crypto = require('crypto');
const { setEx, get, del } = require('../../config/redis');

// ── Schemas ────────────────────────────────────────────────────────────────────
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(2).max(150),
  preferred_language: z.enum(['en', 'am']).optional().default('en'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const sendOTPSchema = z.object({
  email: z.string().email(),
});

const verifyOTPSchema = z.object({
  session_token: z.string(),
  verification_code: z.string().length(6),
});

// ── Service Methods ────────────────────────────────────────────────────────────

const registerWithEmail = async (body) => {
  const { email, password, full_name, preferred_language } = registerSchema.parse(body);

  const passwordError = validatePasswordStrength(password);
  if (passwordError) throw new ApiError(passwordError, 400);

  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) throw new ApiError('Email already registered.', 409);

  const password_hash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      phone_number: `email_${Date.now()}`, // placeholder — updated when user adds phone
      password_hash,
      role: 'BUYER',
      profile: {
        create: { full_name, preferred_language },
      },
    },
    select: { id: true, email: true, role: true, created_at: true },
  });

  return user;
};

const loginWithEmail = async (body) => {
  const { email, password } = loginSchema.parse(body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ApiError('Invalid email or password.', 401);
  if (user.password_hash === 'GOOGLE_OAUTH') throw new ApiError('This account uses Google sign-in.', 400);

  const match = await comparePassword(password, user.password_hash);
  if (!match) throw new ApiError('Invalid email or password.', 401);

  // Write audit log
  await prisma.auditLog.create({
    data: { actor_id: user.id, action: 'USER_LOGIN', target_table: 'users', target_id: user.id },
  });

  return { id: user.id, email: user.email, phone_number: user.phone_number, role: user.role };
};

const sendEmailOTPCode = async (body) => {
  const { email } = sendOTPSchema.parse(body);
  const { sessionToken, otp } = await createOTP(email);
  await sendEmailOTP(email, otp);
  return { sessionToken };
};

const verifyEmailOTPCode = async (body) => {
  const { session_token, verification_code } = verifyOTPSchema.parse(body);
  const result = await verifyOTP(session_token, verification_code);

  if (!result.valid) throw new ApiError(result.reason || 'OTP verification failed.', 400);

  const email = result.identifier;
  let isNew = false;
  let user = await prisma.user.findFirst({ where: { email } });

  if (!user) {
    // Auto-register via OTP
    isNew = true;
    user = await prisma.user.create({
      data: {
        email,
        phone_number: `otp_${Date.now()}`,
        password_hash: 'OTP_AUTH',
        role: 'BUYER',
        is_phone_verified: true,
        profile: { create: { full_name: email.split('@')[0], preferred_language: 'en' } },
      },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { is_phone_verified: true },
    });
  }

  return { user: { id: user.id, email: user.email, role: user.role }, isNew };
};

const sendPasswordResetEmail = async (email) => {
  if (!email) return; // Silent — don't leak whether email exists
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) return;

  const resetToken = crypto.randomBytes(32).toString('hex');
  const key = `reset:${resetToken}`;
  await setEx(key, 15 * 60, user.id); // 15 minutes

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  await sendEmail({
    to: email,
    subject: 'Ethred Password Reset',
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #121212; color: #fff; border-radius: 12px;">
        <h2 style="color: #D4AF37;">Reset Your Password</h2>
        <p>Click the button below to reset your Ethred password. This link expires in 15 minutes.</p>
        <a href="${resetUrl}" style="display:inline-block; margin: 20px 0; padding: 14px 28px; background: #D4AF37; color: #121212; font-weight: 700; border-radius: 8px; text-decoration: none;">Reset Password</a>
        <p style="color: #888; font-size: 13px;">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
};

const resetPassword = async ({ token, password }) => {
  if (!token || !password) throw new ApiError('Token and password are required.', 400);

  const passwordError = validatePasswordStrength(password);
  if (passwordError) throw new ApiError(passwordError, 400);

  const userId = await get(`reset:${token}`);
  if (!userId) throw new ApiError('Reset token expired or invalid.', 400);

  const password_hash = await hashPassword(password);
  await prisma.user.update({ where: { id: userId }, data: { password_hash } });
  await del(`reset:${token}`);
};

const refreshToken = async (req) => {
  const cookieName = process.env.JWT_COOKIE_NAME || 'ethred_token';
  const token = req.cookies?.[cookieName] || req.headers?.authorization?.split(' ')[1];
  if (!token) throw new ApiError('No token provided.', 401);

  const payload = verifyToken(token);
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, role: true },
  });
  if (!user) throw new ApiError('User not found.', 401);

  const newToken = signToken(user.id, user.role);
  return { user, token: newToken };
};

module.exports = {
  registerWithEmail,
  loginWithEmail,
  sendEmailOTPCode,
  verifyEmailOTPCode,
  sendPasswordResetEmail,
  resetPassword,
  refreshToken,
};
