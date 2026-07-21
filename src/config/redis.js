const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient;

const getRedisClient = () => {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    redisClient.on('connect', () => logger.info('✅ Redis connected'));
    redisClient.on('error', (err) => logger.error('Redis error:', err));
    redisClient.on('close', () => logger.warn('Redis connection closed'));
  }
  return redisClient;
};

// Helpers for OTP and caching
const setEx = async (key, seconds, value) => {
  const client = getRedisClient();
  await client.setex(key, seconds, typeof value === 'object' ? JSON.stringify(value) : value);
};

const get = async (key) => {
  const client = getRedisClient();
  const val = await client.get(key);
  try { return JSON.parse(val); } catch { return val; }
};

const del = async (key) => {
  const client = getRedisClient();
  await client.del(key);
};

module.exports = { getRedisClient, setEx, get, del };
