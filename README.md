# Ethred Backend API

> Modern Ethiopian Real Estate Ecosystem — Node.js + Express + PostgreSQL + PostGIS

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Framework | Express 4 |
| ORM | Prisma 5 (PostgreSQL 16 + PostGIS) |
| Auth | JWT (HTTP-only cookie) + Passport.js + Google OAuth |
| Real-time | Socket.IO + Redis Pub/Sub adapter |
| Cache/OTP | Redis (ioredis) |
| Email | Nodemailer (SMTP) |
| File Upload | Multer + Sharp (WebP transcoding at 400/800/1200px) |
| Payments | Chapa API (HMAC webhook) |
| Validation | Zod |
| Logging | Winston |
| Tests | Jest + Supertest |

---

## Quick Start

### 1. Clone & Install

```bash
cd backend
npm install
```

### 2. Set Up Environment

```bash
cp .env.example .env
# Edit .env — fill in SMTP, Google OAuth, Chapa keys
```

### 3. Start Docker (PostgreSQL + Redis)

```bash
docker-compose up -d
```

Wait ~10 seconds for PostgreSQL to be ready.

### 4. Push Database Schema

```bash
npm run db:generate   # generate Prisma client
npm run db:push       # push schema to PostgreSQL
```

### 5. Seed the Database

```bash
npm run db:seed
```

Default accounts created:
| Role | Email | Password |
|---|---|---|
| Admin | admin@ethred.com | Admin@1234 |
| Seller | seller@ethred.com | Seller@1234 |
| Buyer | buyer@ethred.com | Buyer@1234 |

### 6. Start Dev Server

```bash
npm run dev
```

Server: `http://localhost:5000`  
Health check: `http://localhost:5000/health`

---

## API Endpoints

### Auth (`/api/v1/auth`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | No | Email/password registration |
| POST | `/login` | No | Email/password login |
| POST | `/logout` | Yes | Clear session |
| POST | `/send-otp` | No | Send 6-digit OTP via email |
| POST | `/verify-otp` | No | Verify OTP → issue JWT |
| POST | `/forgot-password` | No | Send password reset email |
| POST | `/reset-password` | No | Reset password with token |
| GET | `/google` | No | Google OAuth redirect |
| GET | `/google/callback` | No | Google OAuth callback |
| GET | `/me` | Yes | Get current user |

### Properties (`/api/v1/properties`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/search` | No | Search with filters |
| GET | `/:id` | No | Property detail |
| POST | `/` | Seller+ | Create listing (DRAFT) |
| PUT | `/:id` | Owner/Admin | Update listing |
| DELETE | `/:id` | Owner/Admin | Archive listing |
| POST | `/:id/submit` | Owner | DRAFT → PENDING |
| POST | `/:id/media/images` | Owner | Upload images (WebP) |
| POST | `/:id/media/documents` | Owner | Upload PDF documents |
| DELETE | `/:id/media/:mediaId` | Owner | Delete media |
| GET | `/` | Seller+ | My listings |
| GET | `/:id/stats` | Owner | Views, favorites, inquiries |

### Admin (`/api/v1/admin`) — ADMIN only
| Method | Path | Description |
|---|---|---|
| GET | `/dashboard` | Platform-wide stats |
| GET | `/properties/pending` | Queue for moderation |
| PATCH | `/properties/:id/approve` | Approve listing |
| PATCH | `/properties/:id/suspend` | Suspend listing |
| PATCH | `/properties/:id/reject` | Reject back to DRAFT |
| GET | `/users` | List all users |
| PATCH | `/users/:id/ban` | Ban user |
| PATCH | `/users/:id/verify-identity` | Verify ID |
| PATCH | `/users/:id/role` | Change role |
| GET | `/agencies/pending` | Pending agency approvals |
| PATCH | `/agencies/:id/approve` | Approve agency |
| GET | `/audit-logs` | Full audit log |

---

## Property Status State Machine

```
DRAFT → (submit) → PENDING → (admin approve) → APPROVED
                           → (admin reject)  → DRAFT
                  APPROVED → (admin suspend) → SUSPENDED
                  APPROVED → (3+ reports)    → SUSPENDED (auto)
```

## Payment Flow (Chapa)

```
POST /payments/initiate → Chapa checkout URL
Chapa → POST /payments/chapa-webhook (HMAC verified) → Invoice COMPLETED → Property FEATURED
```

---

## Environment Variables

See `.env.example` for the full list. Key variables:

```
DATABASE_URL      PostgreSQL connection string
REDIS_URL         Redis connection string
JWT_SECRET        Secret for signing JWT tokens
GOOGLE_CLIENT_ID  Google OAuth client ID
GOOGLE_CLIENT_SECRET Google OAuth client secret
SMTP_USER         Gmail address for sending emails
SMTP_PASS         Gmail App Password
CHAPA_SECRET_KEY  Chapa API secret key
CHAPA_WEBHOOK_SECRET Chapa HMAC webhook secret
```

---

## Project Structure

```
src/
├── config/       db.js · redis.js · passport.js · mailer.js
├── middleware/   authenticate · authorize · errorHandler · upload · rateLimiter
├── modules/
│   ├── auth/     register · login · OTP · OAuth · password reset
│   ├── users/    profile · avatar · ID document · notifications
│   ├── agencies/ CRUD · invite · employees · analytics
│   ├── properties/ CRUD · search · media · PostGIS geometry
│   ├── favorites/  add/remove/list
│   ├── inquiries/  buyer ↔ seller messaging · scam reports
│   ├── payments/   Chapa init · webhook · invoices
│   └── admin/    moderation · user mgmt · agency approval · audit logs
├── sockets/      Socket.IO + Redis adapter (real-time chat)
└── utils/        jwt · otp · password · logger · chapaClient
prisma/
├── schema.prisma  Full schema (9 tables, all enums, indexes)
└── seed.js        Default admin/seller/buyer + sample property
```
