const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

// Log slow queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    if (e.duration > 1000) {
      logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
    }
  });
}

prisma.$on('error', (e) => {
  logger.error('Prisma error:', e);
});

const connectDB = async () => {
  try {
    await prisma.$connect();
    logger.info('✅ PostgreSQL connected via Prisma');

    // Enforce: at most ONE active draft per property at the database level.
    // This partial unique index prevents race conditions where two simultaneous
    // requests create duplicate draft clones for the same parent property.
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_active_draft_per_property
      ON properties (parent_id)
      WHERE status IN ('DRAFT', 'PENDING_UPDATE') AND parent_id IS NOT NULL
    `);
    logger.info('✅ Unique draft index verified');
  } catch (err) {
    logger.error('❌ PostgreSQL connection failed:', err);
    process.exit(1);
  }
};

const disconnectDB = async () => {
  await prisma.$disconnect();
  logger.info('PostgreSQL disconnected.');
};

module.exports = { prisma, connectDB, disconnectDB };
