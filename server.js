require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const { initSocket } = require('./src/sockets');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Initialize Socket.IO
initSocket(server);

server.listen(PORT, () => {
  logger.info(`🚀 Ethred API running on port ${PORT} [${process.env.NODE_ENV}]`);
  logger.info(`📖 API Base: http://localhost:${PORT}${process.env.API_PREFIX || '/api/v1'}`);
});

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  server.close(async () => {
    logger.info('HTTP server closed.');
    const { disconnectDB } = require('./src/config/db');
    await disconnectDB();
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    logger.error('Could not shut down gracefully. Forcing exit.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});
