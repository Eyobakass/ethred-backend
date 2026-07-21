/**
 * Auth API Integration Test
 * Tests registration, login, OTP flow, and protected routes
 */

process.env.JWT_SECRET = 'test_jwt_secret_for_unit_tests';
const request = require('supertest');
const app = require('../src/app');

// Mock Prisma & Redis for unit tests
jest.mock('../src/config/db', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    property: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $disconnect: jest.fn(),
  },
  connectDB: jest.fn(),
  disconnectDB: jest.fn(),
}));

jest.mock('../src/config/redis', () => ({
  setEx: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  getRedisClient: jest.fn(),
}));

jest.mock('../src/config/mailer', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
}));

const { prisma } = require('../src/config/db');

describe('POST /api/v1/auth/register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should register a new user and return JWT', async () => {
    prisma.user.findFirst.mockResolvedValue(null); // No existing user
    prisma.user.create.mockResolvedValue({
      id: 'test-uuid-123',
      email: 'test@ethred.com',
      role: 'BUYER',
      created_at: new Date(),
    });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'test@ethred.com',
        password: 'TestPass@1',
        full_name: 'Test User',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(res.body.jwt).toBeDefined();
  });

  it('should reject weak password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'test@ethred.com',
        password: 'weak',
        full_name: 'Test User',
      });

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('should reject duplicate email', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'existing' });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'existing@ethred.com',
        password: 'TestPass@1',
        full_name: 'Test User',
      });

    expect(res.statusCode).toBe(409);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('should return 401 for wrong credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@ethred.com', password: 'wrong' });

    expect(res.statusCode).toBe(401);
  });
});

describe('GET /health', () => {
  it('should return health status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /api/v1/properties/search', () => {
  it('should return search results without auth', async () => {
    prisma.property.count.mockResolvedValue(0);
    prisma.property.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/properties/search')
      .query({ city: 'Addis Ababa', category: 'APARTMENT' });

    expect(res.statusCode).toBe(200);
  });
});
