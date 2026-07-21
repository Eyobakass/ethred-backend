const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { getRedisClient } = require('../config/redis');
const { verifyToken } = require('../utils/jwt');
const logger = require('../utils/logger');
const { prisma } = require('../config/db');
const crypto = require('crypto');

let io;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Redis adapter for horizontal scaling (SRS Section 7.3)
  try {
    const pubClient = getRedisClient();
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('✅ Socket.IO Redis adapter initialized');
  } catch (err) {
    logger.warn('Socket.IO running without Redis adapter:', err.message);
  }

  // ── Authentication middleware ──────────────────────────────────────────────
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) return next(new Error('Authentication required'));

      const payload = verifyToken(token);
      socket.userId = payload.sub;
      socket.userRole = payload.role;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection handler ─────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} (user: ${socket.userId})`);

    // Join user's personal room for direct notifications
    socket.join(`user:${socket.userId}`);

    // ── Join a property chat room ──────────────────────────────────────────
    socket.on('join:inquiry', (inquiryId) => {
      socket.join(`inquiry:${inquiryId}`);
      logger.info(`User ${socket.userId} joined inquiry room: ${inquiryId}`);
    });

    socket.on('leave:inquiry', (inquiryId) => {
      socket.leave(`inquiry:${inquiryId}`);
    });

    // ── Send chat message (REQ-COMM-01) ─────────────────────────────────────
    socket.on('message:send', async (data) => {
      try {
        const { inquiry_id, content } = data;
        if (!inquiry_id || !content?.trim()) return;

        // Validate inquiry exists and user is a participant
        const inquiry = await prisma.propertyInquiry.findUnique({
          where: { id: inquiry_id },
          include: { property: { select: { owner_id: true } } },
        });

        if (!inquiry) return socket.emit('error', { message: 'Inquiry not found' });

        const isParticipant =
          inquiry.buyer_id === socket.userId ||
          inquiry.property.owner_id === socket.userId;

        if (!isParticipant) return socket.emit('error', { message: 'Unauthorized' });

        const message = {
          id: crypto.randomUUID(),
          inquiry_id,
          sender_id: socket.userId,
          content: content.trim(),
          timestamp: new Date().toISOString(),
        };

        // Broadcast to all in the inquiry room
        io.to(`inquiry:${inquiry_id}`).emit('message:received', message);

        // Notify offline participant via their personal room
        const recipientId =
          inquiry.buyer_id === socket.userId
            ? inquiry.property.owner_id
            : inquiry.buyer_id;

        io.to(`user:${recipientId}`).emit('notification:new_message', {
          inquiry_id,
          preview: content.slice(0, 80),
          from: socket.userId,
        });

      } catch (err) {
        logger.error('Socket message:send error:', err);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ── Typing indicator ───────────────────────────────────────────────────
    socket.on('typing:start', ({ inquiry_id }) => {
      socket.to(`inquiry:${inquiry_id}`).emit('typing:start', { user_id: socket.userId });
    });

    socket.on('typing:stop', ({ inquiry_id }) => {
      socket.to(`inquiry:${inquiry_id}`).emit('typing:stop', { user_id: socket.userId });
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${socket.id} (reason: ${reason})`);
    });
  });

  logger.info('✅ Socket.IO initialized');
  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

module.exports = { initSocket, getIO };
