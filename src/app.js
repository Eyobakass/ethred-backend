const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const path = require('path');

const { apiLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Route modules
const authRoutes = require('./modules/auth/routes');
const userRoutes = require('./modules/users/routes');
const agencyRoutes = require('./modules/agencies/routes');
const propertyRoutes = require('./modules/properties/routes');
const favoriteRoutes = require('./modules/favorites/routes');
const inquiryRoutes = require('./modules/inquiries/routes');
const paymentRoutes = require('./modules/payments/routes');
const adminRoutes = require('./modules/admin/routes');

// Passport strategy setup
require('./config/passport');

const app = express();

const API_PREFIX = process.env.API_PREFIX || '/api/v1';

// ── Security ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(cookieParser());

// ── Body Parsing ─────────────────────────────────────────────────────────────
// IMPORTANT: raw body needed for Chapa webhook HMAC verification
app.use((req, res, next) => {
  if (req.originalUrl.includes('/payments/chapa-webhook')) {
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Logging ──────────────────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ── Static Files (local upload storage) ─────────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ── Passport ─────────────────────────────────────────────────────────────────
app.use(passport.initialize());

// ── Rate Limiting ─────────────────────────────────────────────────────────────
app.use(API_PREFIX, apiLimiter);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: require('../package.json').version,
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/agencies`, agencyRoutes);
app.use(`${API_PREFIX}/properties`, propertyRoutes);
app.use(`${API_PREFIX}/favorites`, favoriteRoutes);
app.use(`${API_PREFIX}/inquiries`, inquiryRoutes);
app.use(`${API_PREFIX}/payments`, paymentRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
