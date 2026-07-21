# Ethred Backend — Implementation Plan

> **Project**: Ethred — Modern Ethiopian Real Estate Ecosystem  
> **Stack**: Node.js + Express, PostgreSQL 16+ (PostGIS, pgvector), Redis, Socket.IO  
> **SRS Reference**: SRS-ETHRED-2026-V1.0 — July 2026

---

## Background

Ethred is a cloud-native real estate platform for Ethiopia, built in 9 phased releases. The immediate goal is to scaffold a **Phase 1 & 2** production-ready Express backend covering:

- Auth (email/password, Google OAuth, phone OTP)
- RBAC (Buyer, Seller, Agency Admin, Agency Agent, Platform Admin)
- User & profile management
- Property CRUD with media uploads
- Property search & filtering (region, subcity, category, price, bedrooms)
- Favorites & recently-viewed
- Agency & agent management
- Inquiry system
- Payments (Chapa webhook)
- Admin moderation panel routes
- Audit logs
- Real-time WebSocket foundation (Socket.IO + Redis PubSub)

---

## Open Questions

> [!IMPORTANT]
> **Please review and answer these before execution begins:**
>
> 1. **Database host**: Will you run PostgreSQL locally (via Docker or native install) or connect to a remote/cloud DB? PostGIS is required.
> 2. **SMS OTP provider**: Which local Ethiopian SMS gateway should be integrated? (e.g., AfroMessage, Notify.et, or a mock stub for now?)
> 3. **File storage**: Local disk (multer + serve-static) for now, or S3/Cloudinary from day one?
> 4. **Google OAuth**: Do you have Google OAuth credentials, or should I scaffold the flow and leave placeholders?
> 5. **Chapa API keys**: Should I wire up real Chapa keys or use a webhook stub for now?

---

## Proposed Project Structure

```
backend/
├── src/
│   ├── config/              # DB, Redis, env validation
│   ├── middleware/          # auth (JWT), RBAC, error handler, upload, rate-limit
│   ├── modules/
│   │   ├── auth/            # register, login, OTP, OAuth, refresh
│   │   ├── users/           # profile, notification prefs
│   │   ├── agencies/        # agency CRUD, employee invite
│   │   ├── properties/      # CRUD, media upload, search
│   │   ├── favorites/       # favorites list
│   │   ├── inquiries/       # buyer → seller messaging
│   │   ├── payments/        # Chapa webhook, invoice CRUD
│   │   ├── admin/           # moderation, approval, audit log
│   │   └── chat/            # Socket.IO real-time chat
│   ├── utils/               # jwt, otp, password, validators, logger
│   ├── sockets/             # Socket.IO server + Redis adapter
│   └── app.js               # Express factory
├── prisma/                  # Schema + migrations (Prisma ORM over raw PG)
├── tests/                   # Jest unit & integration tests
├── .env.example
├── .gitignore
├── package.json
└── server.js                # Entry point
```

---

## Technology Decisions

| Concern | Choice | Reason |
|---|---|---|
| ORM | **Prisma** | Type-safe, PostGIS support via raw(), migration workflow |
| Auth | **JWT (httpOnly cookie)** + Passport.js | Matches SRS REQ-AUTH-05 |
| File uploads | **Multer** + **Sharp** (WebP transcode) | REQ-PROP-01 |
| Real-time | **Socket.IO** + `@socket.io/redis-adapter` | REQ-COMM-01 |
| Validation | **Zod** | Schema-first, pairs nicely with Prisma |
| Testing | **Jest** + **Supertest** | REQ unit coverage ≥ 80% |
| Logging | **Winston** | Structured logs for audit trail |
| Rate limiting | **express-rate-limit** | OWASP compliance |

---

## Proposed Changes (File by File)

### Root

#### [NEW] `.gitignore`
#### [NEW] `package.json`
#### [NEW] `.env.example`
#### [NEW] `server.js`
#### [NEW] `src/app.js`

---

### Config

#### [NEW] `src/config/db.js` — Prisma client singleton
#### [NEW] `src/config/redis.js` — ioredis client
#### [NEW] `src/config/env.js` — env validation with Zod

---

### Middleware

#### [NEW] `src/middleware/authenticate.js` — JWT cookie verify
#### [NEW] `src/middleware/authorize.js` — RBAC role guard factory
#### [NEW] `src/middleware/errorHandler.js` — centralized error responses
#### [NEW] `src/middleware/upload.js` — multer + sharp WebP pipeline
#### [NEW] `src/middleware/rateLimiter.js`

---

### Modules (each has `routes.js`, `controller.js`, `service.js`)

#### Auth
- `POST /api/v1/auth/register` — email/password
- `POST /api/v1/auth/register-phone` — send OTP
- `POST /api/v1/auth/verify-otp` — confirm OTP → issue JWT
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/refresh`
- `GET  /api/v1/auth/google` — OAuth redirect
- `GET  /api/v1/auth/google/callback`

#### Users
- `GET  /api/v1/users/me`
- `PUT  /api/v1/users/me`
- `POST /api/v1/users/me/avatar`
- `POST /api/v1/users/me/id-document`

#### Agencies
- `POST /api/v1/agencies` — create agency
- `GET  /api/v1/agencies/:id`
- `PUT  /api/v1/agencies/:id`
- `POST /api/v1/agencies/:id/invite`
- `GET  /api/v1/agencies/:id/employees`
- `DELETE /api/v1/agencies/:id/employees/:userId`

#### Properties
- `POST /api/v1/properties`
- `GET  /api/v1/properties`
- `GET  /api/v1/properties/search`
- `GET  /api/v1/properties/:id`
- `PUT  /api/v1/properties/:id`
- `DELETE /api/v1/properties/:id`
- `POST /api/v1/properties/:id/media`
- `DELETE /api/v1/properties/:id/media/:mediaId`
- `POST /api/v1/properties/:id/submit` — DRAFT → PENDING

#### Favorites
- `POST /api/v1/favorites/:propertyId`
- `DELETE /api/v1/favorites/:propertyId`
- `GET  /api/v1/favorites`

#### Inquiries
- `POST /api/v1/inquiries`
- `GET  /api/v1/inquiries` — buyer's inquiries
- `GET  /api/v1/inquiries/received` — seller's inquiries

#### Payments
- `POST /api/v1/payments/initiate`
- `POST /api/v1/payments/chapa-webhook` (HMAC verified)
- `GET  /api/v1/payments/invoices`

#### Admin
- `GET  /api/v1/admin/properties/pending`
- `PATCH /api/v1/admin/properties/:id/approve`
- `PATCH /api/v1/admin/properties/:id/suspend`
- `GET  /api/v1/admin/users`
- `PATCH /api/v1/admin/users/:id/ban`
- `GET  /api/v1/admin/audit-logs`
- `GET  /api/v1/admin/agencies/pending`
- `PATCH /api/v1/admin/agencies/:id/approve`

---

### Database

#### [NEW] `prisma/schema.prisma` — full schema matching SRS SQL DDL

---

### Utils

#### [NEW] `src/utils/jwt.js`
#### [NEW] `src/utils/otp.js`
#### [NEW] `src/utils/password.js`
#### [NEW] `src/utils/logger.js`
#### [NEW] `src/utils/chapaClient.js`

---

### Sockets

#### [NEW] `src/sockets/index.js` — Socket.IO init with Redis adapter

---

## Verification Plan

### Automated
- `npm run dev` — server boots without errors
- `npx prisma db push` — schema applies cleanly to PostgreSQL

### Manual
- Hit `POST /api/v1/auth/register` → verify JWT cookie set
- Hit `GET /api/v1/properties/search` → verify response shape matches SRS Section 4.2
- Hit `POST /api/v1/payments/chapa-webhook` with mock payload → verify invoice status transitions

---

> [!NOTE]
> This is a **Phase 1 + 2 scaffold**. Phase 3 (subscriptions), Phase 5 (full chat), Phase 9 (AI) will be layered on top. The structure is intentionally modular to support this.
