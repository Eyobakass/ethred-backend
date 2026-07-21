const crypto = require('crypto');
const { setEx, get, del } = require('../config/redis');
const { sendEmail } = require('../config/mailer');

const OTP_EXPIRES_MINUTES = parseInt(process.env.OTP_EXPIRES_MINUTES) || 5;
const OTP_PREFIX = 'otp:';

/**
 * Generate a random 6-digit OTP
 */
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Store OTP in Redis with expiry and return the session token
 * @param {string} identifier - email or phone
 * @returns {{ sessionToken: string, otp: string }}
 */
const createOTP = async (identifier) => {
  const otp = generateOTP();
  const sessionToken = `otp_sess_${crypto.randomBytes(8).toString('hex')}`;
  const key = `${OTP_PREFIX}${sessionToken}`;

  await setEx(key, OTP_EXPIRES_MINUTES * 60, JSON.stringify({ otp, identifier }));

  return { sessionToken, otp };
};

/**
 * Verify OTP from Redis
 * @param {string} sessionToken
 * @param {string} code
 * @returns {{ valid: boolean, identifier?: string }}
 */
const verifyOTP = async (sessionToken, code) => {
  const key = `${OTP_PREFIX}${sessionToken}`;
  const stored = await get(key);

  if (!stored) return { valid: false, reason: 'OTP expired or not found' };

  const { otp, identifier } = typeof stored === 'string' ? JSON.parse(stored) : stored;

  if (otp !== code) return { valid: false, reason: 'Invalid OTP code' };

  // Consume the OTP (one-time use)
  await del(key);

  return { valid: true, identifier };
};

/**
 * Send OTP via email
 */
const sendEmailOTP = async (email, otp) => {
  await sendEmail({
    to: email,
    subject: 'Your Ethred Verification Code',
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #121212; color: #ffffff; border-radius: 12px;">
        <h2 style="color: #D4AF37; margin-bottom: 8px;">Ethred</h2>
        <p style="color: #aaa; margin-bottom: 24px;">Your verification code is:</p>
        <div style="font-size: 48px; font-weight: 700; letter-spacing: 12px; color: #D4AF37; text-align: center; padding: 24px; background: #1e1e1e; border-radius: 8px;">
          ${otp}
        </div>
        <p style="color: #888; margin-top: 24px; font-size: 14px;">
          This code expires in <strong>${OTP_EXPIRES_MINUTES} minutes</strong>. Do not share it with anyone.
        </p>
      </div>
    `,
  });
};

module.exports = { createOTP, verifyOTP, sendEmailOTP };
