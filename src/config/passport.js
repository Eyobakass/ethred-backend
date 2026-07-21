const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { prisma } = require('./db');
const logger = require('../utils/logger');

// ── JWT Strategy (extract from HTTP-only cookie) ─────────────────────────────
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromExtractors([
    // 1. HTTP-only cookie (primary)
    (req) => {
      if (req && req.cookies) return req.cookies[process.env.JWT_COOKIE_NAME || 'ethred_token'];
      return null;
    },
    // 2. Bearer token fallback (for mobile clients)
    ExtractJwt.fromAuthHeaderAsBearerToken(),
  ]),
  secretOrKey: process.env.JWT_SECRET || 'ethred_jwt_fallback_secret_key_2026',
};

passport.use(
  new JwtStrategy(jwtOptions, async (payload, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, phone_number: true, role: true, is_phone_verified: true },
      });
      if (!user) return done(null, false);
      return done(null, user);
    } catch (err) {
      logger.error('JWT Strategy error:', err);
      return done(err, false);
    }
  })
);

// ── Google OAuth 2.0 Strategy ─────────────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error('No email from Google'), false);

          let user = await prisma.user.findFirst({ where: { email } });

          if (!user) {
            // Auto-register with Google
            user = await prisma.user.create({
              data: {
                email,
                phone_number: `google_${profile.id}`, // placeholder until user adds phone
                password_hash: 'GOOGLE_OAUTH',
                role: 'BUYER',
                is_phone_verified: false,
                profile: {
                  create: {
                    full_name: profile.displayName || email.split('@')[0],
                    avatar_url: profile.photos?.[0]?.value || null,
                    preferred_language: 'en',
                  },
                },
              },
            });
          }

          return done(null, user);
        } catch (err) {
          logger.error('Google Strategy error:', err);
          return done(err, false);
        }
      }
    )
  );
} else {
  logger.warn('Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
}
