# Ethred Backend — Architecture & API Integration Reference

> Generated documentation of the **Ethred** (Modern Ethiopian Real Estate Ecosystem) Express API.
> This is the single source of truth for building the Next.js frontend. **The backend is not modified.**

---

## 1. Tech Stack & Runtime

| Concern | Technology |
|---|---|
| Runtime | Node.js ≥ 20, Express 4 |
| Database | PostgreSQL 16 + PostGIS (geography), via Prisma 5 |
| ORM | Prisma (`@prisma/client`) — raw SQL used for PostGIS `geom_point` |
| Cache / PubSub | Redis (`ioredis`) — OTP, password-reset tokens, Socket.IO adapter |
| Auth | JWT (Passport JWT strategy) + Google OAuth 2.0 (`passport-google-oauth20`) |
| Realtime | Socket.IO 4 (`@socket.io/redis-adapter`) |
| Validation | Zod |
| Uploads | Multer (memory) + Sharp (WebP transcode, panorama processing) |
| Payments | Chapa (Ethiopian gateway) — HMAC-verified webhook |
| Email | Nodemailer (SMTP) — OTP, transactional emails |
| Rate limiting | `express-rate-limit` |

### Base URL & Prefix
- API prefix: `API_PREFIX` (default **`/api/v1`**)
- Server port: `PORT` (default **5000**)
- Health: `GET /health` and `GET /api/v1/health` (HTML by default, JSON with `?format=json` or `Accept: application/json`)

### CORS / Credentials
- CORS is **permissive** (all origins allowed) with `credentials: true`.
- Allowed headers: `Content-Type`, `Authorization`, `X-Internal-Service-Key`, `X-Client-Type`.
- Methods: `GET, POST, PUT, PATCH, DELETE, OPTIONS`.

---

## 2. Authentication Model

### Two transport mechanisms (both accepted on every protected route)
1. **HTTP-only cookie** named by `JWT_COOKIE_NAME` (default `ethred_token`) — primary.
   - Set on register/login/verify-otp/refresh/google callback.
   - Cookie flags: `httpOnly`, `secure` (prod only), `sameSite: 'none'` in prod / `'lax'` in dev, `maxAge` 7 days.
2. **Bearer token** — `Authorization: Bearer <jwt>` fallback (for clients that can't use cookies).

> **Frontend implication:** Auth responses ALSO return the raw token in the JSON body as both `token` and `jwt`. Because the cookie is `sameSite=none; secure` in production and the API is likely cross-domain, the frontend should **store the returned `jwt` and send it as a `Authorization: Bearer` header** for reliability, while also sending `credentials: 'include'` so the cookie path works where possible.

### JWT payload
```
{ sub: <userId>, role: <UserRole>, iat, exp }
```
`JWT_EXPIRES_IN` default `7d`.

### `req.user` shape (attached by authenticate middleware)
```
{ id, email, phone_number, role, is_phone_verified }
```

### Roles (RBAC)
`BUYER | SELLER | AGENCY_ADMIN | AGENCY_AGENT | ADMIN`

- Default role on register: `BUYER` (register accepts `BUYER | SELLER | AGENCY_ADMIN`).
- OTP auto-registration & Google auto-registration → `BUYER`.
- Agency approval elevates the agency's admin user to `AGENCY_ADMIN`.
- Admin can change any user's role.

### Auth account types (password_hash sentinels)
- Normal password account → real bcrypt hash.
- `GOOGLE_OAUTH` → Google sign-in only (password login/change blocked).
- `OTP_AUTH` → email-OTP account (password login/change blocked).

---

## 3. Standard Response Envelope

Success:
```json
{ "success": true, ...payload }
```
Common payload keys:
- Single resource: `data`
- Collections: `results`, `count`, `page`, `limit`
- Auth: `user`, `token`, `jwt`, `message`, `isNew`, `session_token`

Errors (from centralized `errorHandler`):
```json
{ "success": false, "message": "...", "errors?": [{ "field", "message" }], "field?": "..." }
```
| Status | Meaning |
|---|---|
| 400 | ApiError / bad input |
| 401 | Unauthenticated / invalid/expired token |
| 403 | Wrong role / not owner |
| 404 | Not found (also Prisma P2025) |
| 409 | Duplicate (Prisma P2002 / explicit) |
| 413 | File too large (Multer) |
| 422 | Zod validation failure (`errors[]`) or panorama processing error |
| 500 | Internal (message hidden in prod) |

Some ApiErrors include a machine code as 3rd arg (e.g. `REVISION_REQUIRED`, `NO_TOUR_AVAILABLE`, `SCENE_NOT_FOUND`) — surfaced via `message`, not a separate field.

### Rate limits
- Global (`/api/v1/*`): `RATE_LIMIT_MAX` (default 100) / `RATE_LIMIT_WINDOW_MS`.
- Auth endpoints (`authLimiter`): 10 requests / 15 min (successful requests are skipped).

---

## 4. Data Models (Prisma)

Key entities and important fields (all IDs are UUID strings; timestamps are ISO `Timestamptz`):

### User
`id, email?, phone_number(unique), role, is_phone_verified, is_identity_verified, created_at, updated_at`
- Relations: `profile`, `properties`, `agency_admin`, `agency_membership`, `favorites`, `inquiries_sent`, `invoices`.
- `phone_number` gets a placeholder for email/OTP/Google accounts (`email_*`, `otp_*`, `google_*`).

### Profile
`user_id(unique), full_name, avatar_url?, preferred_language('en'|'am')`

### Agency
`id, admin_id, agency_name(unique), logo_url?, business_license_url, is_approved, created_at`

### AgencyEmployee
`agency_id, user_id(unique), assigned_role(default 'AGENT')`

### Property
`id, owner_id, agency_id?, title_en, title_am?, description_en, description_am?,`
`price_etb(Decimal), price_usd?, transaction_mode(SALE|RENT), category,`
`region, city, sub_city, woreda, kebele?, nearest_landmark?,`
`bedrooms, bathrooms, area_sqm(Decimal), status,`
`is_featured, featured_tier?, featured_until?, external_tour_url?, floor_plan_url?,`
`created_at, updated_at`
- `category`: `HOUSE | APARTMENT | LAND | COMMERCIAL | OFFICE | WAREHOUSE | VACATION`
- `status`: `DRAFT | PENDING | APPROVED | SUSPENDED | ARCHIVED`
- Coordinates: sent as `latitude`/`longitude` on create/update; stored via PostGIS raw SQL (not returned as fields).
- Relations: `media[]`, `amenities[]`, `inquiries[]`, `favorites[]`, `owner`, `agency`.

### PropertyMedia
`id, property_id, file_url, media_category(IMAGE|VIDEO|DOCUMENT), sort_order, created_at,`
`is_tour_scene, scene_name?, initial_yaw?(0-360), needs_repair,`
`fp_x?(0-100), fp_y?(0-100)` — floor-plan pin position as %.
- `file_url` may be a `/uploads/...` path OR a `data:image/jpeg;base64,...` URL (tour scenes are stored as base64 data URLs to survive container restarts).

### Hotspot
`id, scene_id, type(NAVIGATION|INFO), yaw(0-360), pitch(-90..90), target_scene_id?, label?, created_at, updated_at`
- NAVIGATION requires `target_scene_id` (must belong to same property tour, not self).
- INFO requires `label`.

### PropertyAmenity
`property_id, amenity_name` (unique per property).

### PropertyInquiry
`id, property_id, buyer_id, message, status(default 'NEW'), created_at`
- Status values used by API: `NEW | IN_PROGRESS | RESOLVED | DISMISSED`.

### UserFavorite
`user_id, property_id` (unique together).

### BillingInvoice
`id, user_id, amount(Decimal), currency('ETB'|'USD'), tx_ref(unique), payment_processor('CHAPA'), status(PENDING|COMPLETED|FAILED|REFUNDED), metadata(Json), created_at, updated_at`

### AuditLog
`id, actor_id?, action, target_table, target_id?, old_values?, new_values?, created_at`

---

## 5. API Endpoints (complete)

> Legend — Auth: 🔓 public · 🔒 any authenticated · 🎭 role-restricted (roles listed).
> All paths are relative to `/api/v1`.

### 5.1 Auth — `/auth`
| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| POST | `/auth/register` | 🔓 | `{ email, password(min8), full_name, preferred_language?('en'\|'am'), role?('BUYER'\|'SELLER'\|'AGENCY_ADMIN') }` → 201, sets cookie, returns `user, token, jwt`. Password strength validated. |
| POST | `/auth/login` | 🔓 | `{ email, password }` → sets cookie, returns `user, token, jwt`. |
| POST | `/auth/logout` | 🔒 | Clears cookie. |
| POST | `/auth/send-otp` | 🔓 | `{ email }` → emails 6-digit OTP, returns `session_token`. |
| POST | `/auth/verify-otp` | 🔓 | `{ session_token, verification_code(6) }` → sets cookie, returns `user, token, jwt, isNew`. Auto-registers new users as BUYER. |
| POST | `/auth/forgot-password` | 🔓 | `{ email }` → always 200 (no leak); emails reset link `FRONTEND_URL/reset-password?token=...` (15 min TTL). |
| POST | `/auth/reset-password` | 🔓 | `{ token, password }`. |
| PUT | `/auth/change-password` | 🔒 | `{ current_password, new_password(min8) }`. Blocked for Google/OTP accounts. |
| GET | `/auth/google` | 🔓 | OAuth redirect (scope profile+email). |
| GET | `/auth/google/callback` | 🔓 | Redirects to `FRONTEND_URL/auth/success?role=<ROLE>` with cookie set. |
| POST | `/auth/refresh` | cookie/bearer | Returns new `jwt` + `user`. |
| GET | `/auth/me` | 🔒 | Returns `{ user }` (`id, email, phone_number, role, is_phone_verified`). |

> **Frontend note:** `google/callback` sets the cookie then redirects to `/auth/success?role=...`. Build a `/auth/success` page that reads the role, calls `/auth/me` (or `/auth/refresh`) to hydrate the session, and routes to the correct dashboard.

### 5.2 Users — `/users` (all 🔒)
| Method | Path | Body / Notes |
|---|---|---|
| GET | `/users/me` | Full user incl. `profile` (no password_hash). |
| PUT | `/users/me` | `{ full_name?, preferred_language?, phone_number?, email? }` (strict). Returns updated profile. |
| DELETE | `/users/me` | Hard-delete account (blocked if user is an agency admin). Clears cookie. |
| POST | `/users/me/avatar` | `multipart/form-data` field **`avatar`** (image). Returns `{ avatar_url }`. |
| POST | `/users/me/id-document` | `multipart/form-data` field **`document`** (PDF/image). Flags for admin verification. |
| PUT | `/users/me/notifications` | `{ email_notifications?, sms_notifications?, push_notifications? }`. |

### 5.3 Agencies — `/agencies`
| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| POST | `/agencies` | 🔒 | `multipart/form-data`: field **`business_license`** (doc) + `agency_name`. Creates unapproved agency. |
| GET | `/agencies/:id` | 🔓 | Agency + employees. |
| PUT | `/agencies/:id` | 🎭 AGENCY_ADMIN, ADMIN | `{ agency_name?, logo_url? }`. |
| POST | `/agencies/:id/invite` | 🎭 AGENCY_ADMIN, ADMIN | `{ email }` → emails invite link. |
| GET | `/agencies/:id/employees` | 🎭 AGENCY_ADMIN, AGENCY_AGENT, ADMIN | Employee list. |
| DELETE | `/agencies/:id/employees/:userId` | 🎭 AGENCY_ADMIN, ADMIN | Remove employee. |
| GET | `/agencies/:id/analytics` | 🎭 AGENCY_ADMIN, ADMIN | `{ total_agents, total_listings, total_inquiries, per_agent[] }`. |

### 5.4 Properties — `/properties`
| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| GET | `/properties/search` | 🔓 | Query: `region, sub_city, city, woreda, category, transaction_mode, price_min, price_max, bedrooms, bathrooms, page, limit, sort, order`. Returns `{ count, page, limit, results[] }` (APPROVED only). Each result has `thumbnail_url` + `media[≤5]` + `owner`. |
| GET | `/properties/:id` | 🔓 | Full property incl. `media`, `amenities`, `owner`, `agency`. |
| GET | `/properties/:id/tour` | 🔓 | Pannellum-style tour config (see §6). 404 if no tour. Cache-Control set. |
| POST | `/properties` | 🎭 SELLER, AGENCY_ADMIN, AGENCY_AGENT, ADMIN | Create (status DRAFT). Body = property schema (§6.1). |
| PUT | `/properties/:id` | 🎭 SELLER, AGENCY_ADMIN, AGENCY_AGENT, ADMIN | Partial update (owner or ADMIN). |
| DELETE | `/properties/:id` | 🎭 SELLER, AGENCY_ADMIN, ADMIN | Soft-delete → status ARCHIVED. |
| POST | `/properties/:id/submit` | 🎭 SELLER, AGENCY_ADMIN, AGENCY_AGENT | DRAFT → PENDING. Blocked (`REVISION_REQUIRED`) if rejected & not edited since. |
| GET | `/properties` | 🎭 SELLER, AGENCY_ADMIN, AGENCY_AGENT, ADMIN | Owner's own listings. Query: `page, limit, status`. DRAFT items may include `rejection_info`. |
| GET | `/properties/:id/stats` | 🎭 owner roles | `{ property_id, favorites_count, inquiries_count }`. |
| POST | `/properties/:id/media/images` | 🎭 owner roles | `multipart`: field **`images`** (≤10). Transcoded to WebP @400/800/1200. |
| POST | `/properties/:id/media/documents` | 🎭 owner roles | `multipart`: field **`document`**. |
| DELETE | `/properties/:id/media/:mediaId` | 🎭 owner roles | Delete media. |
| PATCH | `/properties/:id/media/:mediaId` | 🎭 owner roles | `{ scene_name }`. |
| POST | `/properties/:id/media/tour-scene` | 🎭 owner roles | `multipart`: field **`file`** (JPEG/PNG, 2:1 ratio). Query: `scene_name, initial_yaw`. Sets `needs_repair=true`. |
| PATCH | `/properties/:id/tour/reorder` | 🎭 owner roles | `{ scene_order: [{ scene_id, sort_order }] }`. |
| POST | `/properties/:id/floor-plan` | 🎭 owner roles | `multipart`: field **`file`** (image/PDF) OR `{ file_url }`. |

### 5.5 Favorites — `/favorites` (all 🔒)
| Method | Path | Notes |
|---|---|---|
| POST | `/favorites/:propertyId` | Add (idempotent upsert) → 201. |
| DELETE | `/favorites/:propertyId` | Remove. |
| GET | `/favorites` | `{ count, page, limit, results[] }`; each result embeds `property` (with 1 media). |

### 5.6 Inquiries — `/inquiries` (all 🔒)
| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| POST | `/inquiries` | 🎭 BUYER, SELLER, AGENCY_ADMIN, AGENCY_AGENT | `{ property_id(uuid), message(5-2000) }`. Property must be APPROVED. Emails owner. |
| GET | `/inquiries` | 🔒 | Buyer's own sent inquiries. `{ count, results[] }`. |
| GET | `/inquiries/received` | 🎭 SELLER, AGENCY_ADMIN, AGENCY_AGENT, ADMIN | Received on owned properties. Query `status`. |
| GET | `/inquiries/:id` | 🔒 | Buyer, owner, or ADMIN only. |
| PATCH | `/inquiries/:id/status` | 🎭 SELLER, AGENCY_ADMIN, AGENCY_AGENT, ADMIN | `{ status: NEW\|IN_PROGRESS\|RESOLVED\|DISMISSED }`. |
| POST | `/inquiries/report/:propertyId` | 🎭 BUYER, SELLER | `{ reason(5-500) }`. Auto-suspends property after 3+ reports. |

### 5.7 Payments — `/payments`
| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| POST | `/payments/initiate` | 🎭 SELLER, AGENCY_ADMIN, ADMIN | `{ property_id(uuid), promotion_tier(HOMEPAGE_FEATURED\|SEARCH_BOOST\|PREMIUM_BADGE), currency?(ETB\|USD) }` → `{ checkout_url, tx_ref, invoice_id }`. Tiers: 2500 / 1500 / 800 ETB. |
| GET | `/payments/invoices` | 🔒 | User's invoices. Query `page, limit, status`. |
| GET | `/payments/invoices/:id` | 🔒 | Owner or ADMIN. |
| POST | `/payments/chapa-webhook` | 🔓 (HMAC) | Chapa server-to-server. **Not called by frontend.** |

> **Payment flow (frontend):** call `/payments/initiate`, then redirect the user to `checkout_url`. Chapa calls the webhook to complete. After returning, poll `/payments/invoices/:id` until `status === 'COMPLETED'`.

### 5.8 Admin — `/admin` (all 🎭 ADMIN)
| Method | Path | Body / Notes |
|---|---|---|
| GET | `/admin/properties/pending` | Pending listings. `page, limit`. |
| PATCH | `/admin/properties/:id/approve` | PENDING → APPROVED. |
| PATCH | `/admin/properties/:id/suspend` | `{ reason(min5) }` → SUSPENDED. |
| PATCH | `/admin/properties/:id/reject` | `{ reason(min5) }` → back to DRAFT (logs feedback). |
| GET | `/admin/users` | Query `page, limit, role, search`. |
| GET | `/admin/users/:id` | Includes `_count.properties`. |
| PATCH | `/admin/users/:id/ban` | `{ reason(min5) }` (audit-log flag). |
| PATCH | `/admin/users/:id/verify-identity` | Sets `is_identity_verified=true`. |
| PATCH | `/admin/users/:id/role` | `{ role }`. |
| GET | `/admin/agencies/pending` | Unapproved agencies. |
| PATCH | `/admin/agencies/:id/approve` | Approves + elevates admin to AGENCY_ADMIN. |
| PATCH | `/admin/agencies/:id/reject` | `{ reason(min5) }`. |
| GET | `/admin/audit-logs` | Query `page, limit, action, target_table, actor_id`. |
| GET | `/admin/dashboard` | Aggregated stats: users by role, properties by category, revenue, pending counts. |

### 5.9 Hotspots — `/hotspots` (all 🎭 SELLER, AGENCY_ADMIN, AGENCY_AGENT, ADMIN)
| Method | Path | Body / Notes |
|---|---|---|
| POST | `/hotspots` | `{ scene_id, type(NAVIGATION\|INFO), yaw(0-360), pitch(-90..90), target_scene_id?, label? }`. |
| PATCH | `/hotspots/:id` | `{ yaw?, pitch?, label?, target_scene_id? }`. |
| DELETE | `/hotspots/:id` | 204 No Content. |

### 5.10 Media — `/media`
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/media?needs_repair=true` | Internal only (`X-Internal-Service-Key`) | Repair worker poll. **Not for frontend.** |
| PATCH | `/media/:id` | 🔒 (agent) or internal key | Agent fields: `{ scene_name?, initial_yaw?, sort_order?, fp_x?, fp_y? }`. Used for floor-plan pin placement & scene metadata. |

---

## 6. Virtual Tour System

### 6.1 Property create/update body (Zod `propertySchema`)
```
title_en (5-255), title_am?, description_en (min20), description_am?,
price_etb (>=0), price_usd?,
transaction_mode (SALE|RENT, default SALE),
category (HOUSE|APARTMENT|LAND|COMMERCIAL|OFFICE|WAREHOUSE|VACATION, default HOUSE),
region (min2), city (min2), sub_city (min2), woreda (min1), kebele?, nearest_landmark?,
bedrooms (int>=0), bathrooms (int>=0), area_sqm (>0),
latitude?, longitude?, agency_id?(uuid), amenities?(string[])
```
Coordinates are numbers used only to set the PostGIS point; not returned as columns.

### 6.2 Tour config response (`GET /properties/:id/tour`)
```json
{
  "default": { "firstScene": "<sceneId>", "sceneFadeDuration": 1000, "autoLoad": true, "showControls": true, "keyboardZoom": false },
  "scenes": {
    "<sceneId>": {
      "title": "Living Room", "type": "equirectangular", "panorama": "<file_url|dataURL>",
      "yaw": 0, "fp_x": 12.5, "fp_y": 44.0,
      "hotSpots": [ { "id", "pitch", "yaw", "type": "scene|info", "text", "sceneId?", "cssClass" } ]
    }
  },
  "meta": { "property_id", "scene_count", "external_tour_url", "floor_plan_url" }
}
```
This is **Pannellum-compatible** (`type: scene` = navigation, `type: info` = info). The frontend tour viewer should be built around **Pannellum** (or an equivalent equirectangular viewer) with a floor-plan minimap driven by `fp_x`/`fp_y`.

### 6.3 Panorama upload rules
- JPEG/PNG only, ≤ `MAX_PANORAMA_SIZE_MB` (default 50MB).
- Must be ~2:1 aspect ratio (1.9–2.1 tolerance) or → 422 `INVALID_PANORAMA_RATIO`.
- Downsampled to ≤ 8192×4096, stored as base64 data URL, `needs_repair=true` (a Python worker fixes seams/exposure out of band).

---

## 7. Realtime (Socket.IO)

- Connect to the server root (same host as API) with `auth: { token: <jwt> }` (or `Authorization: Bearer`).
- On connect the socket joins `user:<userId>`.
- **Client → server events:** `join:inquiry`(inquiryId), `leave:inquiry`(inquiryId), `message:send`({ inquiry_id, content }), `typing:start`({ inquiry_id }), `typing:stop`({ inquiry_id }).
- **Server → client events:** `message:received`(message), `notification:new_message`({ inquiry_id, preview, from }), `typing:start`/`typing:stop`({ user_id }), `error`({ message }).
- Chat messages are **broadcast-only (not persisted)** — there is no message history endpoint. History would only be the initial inquiry message via the inquiries API.

> **Frontend implication:** Inquiry chat is live-only. Render the initial inquiry message from the REST API, then append realtime messages received during the session.

---

## 8. Uploads & Media URLs

- Static files served at `/uploads/...` with permissive CORS (`Access-Control-Allow-Origin: *`) — safe to load in `<img>`/canvas.
- Property images return responsive WebP; the stored `file_url` is the 800px variant. (400/1200 variants exist at the same path with `_400`/`_1200` suffixes but only `w800` is persisted to DB.)
- Tour panoramas & some docs may be **base64 data URLs** — render directly, do not prefix with the API host.
- To build absolute URLs for `/uploads/...` paths, prefix with the API origin (e.g. `NEXT_PUBLIC_API_URL` without the `/api/v1` suffix).

---

## 9. Frontend Environment Variables (planned)

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | API origin, e.g. `http://localhost:5000` (append `/api/v1` in the client). |
| `NEXT_PUBLIC_API_PREFIX` | Optional, default `/api/v1`. |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.IO origin (usually same as API origin). |

---

## 10. Role → Feature Matrix (frontend surfaces)

| Role | Primary surfaces |
|---|---|
| **BUYER** | Search/browse, property detail + tour, favorites, send inquiries, inquiry chat, report listing, profile. |
| **SELLER** | All buyer features + create/edit listings, media & tour builder (scenes/hotspots/floor plan), submit for review, listing stats, received inquiries, promote (payments), invoices. |
| **AGENCY_ADMIN** | Seller features + agency profile, invite/remove agents, agency analytics. |
| **AGENCY_AGENT** | Seller-style listing management within the agency; view employees. |
| **ADMIN** | Moderation (properties/agencies), user management, audit logs, platform dashboard, + all above. |

---

## 11. Notable Behaviors / Gotchas for the Frontend

1. **Tokens:** prefer the `jwt` from the response body as a Bearer header; still send `credentials: 'include'`.
2. **Search returns only APPROVED** properties; sellers see all their own statuses via `GET /properties`.
3. **Rejection loop:** a rejected listing goes back to DRAFT with `rejection_info`; the user must edit before `/submit` (else `REVISION_REQUIRED`).
4. **Tours:** `GET /properties/:id/tour` throws 404 (`NO_TOUR_AVAILABLE`) when there are no scenes — treat as "no tour", not an error.
5. **Payments** are redirect-based (Chapa `checkout_url`); confirmation is async via webhook → poll invoice status.
6. **Inquiry chat** is ephemeral (Socket.IO only, no persistence).
7. **Validation errors** are 422 with `errors: [{ field, message }]` — map these to form fields.
8. **File field names matter:** `avatar`, `document`, `business_license`, `images`, `file` (tour-scene / floor-plan) — must match exactly.
9. **Multipart vs JSON:** uploads are `multipart/form-data`; everything else is JSON. Some upload routes read extra params from the **query string** (tour-scene `scene_name`/`initial_yaw`).
10. **Decimals** (`price_etb`, `area_sqm`, invoice `amount`) may serialize as strings — coerce before formatting.
```
