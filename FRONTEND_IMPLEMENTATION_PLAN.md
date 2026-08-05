# Ethred Frontend — Phased Implementation Plan

> A production-ready **Next.js (App Router)** frontend that integrates with **every** endpoint of the Ethred Express API documented in `BACKEND_ARCHITECTURE.md`. The backend is **not** modified.
> Work proceeds **one phase at a time**. Each phase lists scope, deliverables, endpoints covered, and a done-when checklist. Do not start a phase until told to.

---

## Guiding Principles

- **Stack:** Next.js App Router + TypeScript, Tailwind + shadcn/ui, SWR for data fetching/caching, `react-hook-form` + `zod` for forms (schemas mirror the backend Zod rules), `socket.io-client` for realtime, Pannellum for tours.
- **Auth transport:** store the `jwt` from auth responses and send it as `Authorization: Bearer`; also send `credentials: 'include'` so the cookie path works. Token kept in an httpOnly-style context + memory, mirrored where needed for the API client.
- **Single API client:** one typed fetch wrapper (`lib/api-client.ts`) that injects the base URL (`NEXT_PUBLIC_API_URL` + `/api/v1`), attaches the Bearer token, sends credentials, and normalizes the `{ success, ... }` envelope + error shapes (422 `errors[]` → field errors, machine codes like `REVISION_REQUIRED`).
- **Response conventions honored everywhere:** collections → `{ results, count, page, limit }`; single → `data`; decimals (`price_etb`, `area_sqm`, `amount`) coerced from string; media `file_url` may be a `/uploads/...` path (prefix with API origin) **or** a base64 data URL (render as-is).
- **RBAC on the client:** route groups + a role guard reflect the Role→Feature matrix. Client guards are UX only; the backend remains the source of truth.
- **Design direction:** trustworthy, modern Ethiopian real-estate marketplace — clean, image-forward, bilingual-ready (en/am). Committed aesthetic decided during Phase 1 via design inspiration.
- **Verification:** every user-facing phase is verified in-browser with the `agent-browser` skill before being marked done.

---

## Environment Variables (frontend)

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | API origin (e.g. `http://localhost:5000`); `/api/v1` appended in the client. |
| `NEXT_PUBLIC_API_PREFIX` | Optional, defaults to `/api/v1`. |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.IO origin (usually same as API origin). |

---

## Phase 0 — Foundation & Infrastructure

**Goal:** project skeleton, API layer, auth plumbing, and design system — no feature screens yet.

**Scope / deliverables**
- Next.js App Router + TypeScript project config; Tailwind theme + shadcn/ui set up with the committed color palette and 2 font families (design tokens in `globals.css`).
- `lib/api-client.ts` — typed fetch wrapper: base URL, Bearer injection, `credentials: 'include'`, envelope unwrap, error normalization (400/401/403/404/409/413/422/500), 422 → `{ field, message }[]`.
- `lib/types.ts` — TypeScript models mirroring Prisma entities (User, Profile, Agency, Property, PropertyMedia, Hotspot, Inquiry, Favorite, BillingInvoice, AuditLog) + enums (roles, category, status, transaction_mode, promotion_tier).
- `lib/format.ts` — currency (ETB/USD), decimal coercion, date, address composition helpers; `mediaUrl()` helper (data-URL passthrough vs `/uploads` prefixing).
- **Auth context/provider** — holds session + token; `useAuth()` hook; bootstrap via `/auth/me`; SWR global config.
- **Route structure**: `(public)`, `(auth)`, `(dashboard)` route groups; middleware/guard scaffolding + `<RoleGuard>` component.
- App shell: root layout, metadata/SEO, header/footer, theming, toast system, loading/error boundaries.
- Reusable primitives: buttons, inputs, form field wrapper (binds to 422 errors), pagination, empty/error/skeleton states, image component with fallback.

**Endpoints wired (infra-level):** `GET /auth/me` (bootstrap), health check.

**Done when:** app builds and runs, design system renders, API client + auth context verified against a mocked/real `/auth/me`, route groups guard correctly.

---

## Phase 1 — Authentication & Session

**Goal:** every way in and out of the app.

**Scope / deliverables**
- Pages: `/login`, `/register` (role select: BUYER/SELLER/AGENCY_ADMIN), `/forgot-password`, `/reset-password?token=`, OTP flow (`/login/otp` → send-otp → verify-otp with `session_token`), `/change-password` (in settings), `/auth/success` (Google callback landing: read `?role=`, hydrate via `/auth/me`, route to dashboard), Google sign-in button.
- Password-strength UX matching backend rules (min 8 + strength check).
- Logout, token refresh handling (call `/auth/refresh` on 401 once, then sign out).
- Guards: redirect unauthenticated users from protected routes; redirect authenticated users away from auth pages by role.
- Block password change UI for Google/OTP accounts (surfaced from account type).

**Endpoints covered:** `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/send-otp`, `/auth/verify-otp`, `/auth/forgot-password`, `/auth/reset-password`, `PUT /auth/change-password`, `GET /auth/google`, `GET /auth/google/callback` (landing), `POST /auth/refresh`, `GET /auth/me`.

**Done when:** register/login/OTP/Google/reset/refresh/logout all work end-to-end and set the session; 422 field errors + auth rate-limit (10/15min) handled gracefully; verified in-browser.

---

## Phase 2 — Public Property Discovery

**Goal:** the buyer-facing marketplace (works logged-out).

**Scope / deliverables**
- Home/landing: featured listings, search entry, category browse.
- **Search page** with full filter set: `region, sub_city, city, woreda, category, transaction_mode, price_min, price_max, bedrooms, bathrooms, sort, order` + pagination; results grid using `thumbnail_url`/`media[≤5]`; URL-synced filters (shareable).
- **Property detail page**: gallery, amenities, address, owner/agency card, price (ETB/USD), map location; CTAs (favorite, inquire) gated by auth.
- Loading skeletons, empty states, SEO metadata per listing.

**Endpoints covered:** `GET /properties/search`, `GET /properties/:id`. (Amenities/media/owner/agency come embedded.)

**Done when:** search + filters + pagination + detail render correctly against real data, decimals formatted, images resolve (uploads + data URLs), verified in-browser.

---

## Phase 3 — Virtual Tour Viewer

**Goal:** immersive 360° tours with floor-plan minimap.

**Scope / deliverables**
- Integrate **Pannellum** (equirectangular). Consume `GET /properties/:id/tour` config directly (scenes, `firstScene`, fade, controls).
- Render **navigation** (`type: scene`) and **info** (`type: info`) hotspots from the config.
- **Floor-plan minimap** driven by `fp_x`/`fp_y` pins; click-to-jump between scenes; sync active scene highlight.
- Handle base64 data-URL panoramas directly; support `external_tour_url` fallback.
- Graceful "no tour available" state (404 `NO_TOUR_AVAILABLE` treated as absence, not error). Entry point from the Phase 2 detail page.

**Endpoints covered:** `GET /properties/:id/tour`.

**Done when:** tours load, hotspots navigate, minimap tracks scenes, no-tour case handled; verified in-browser.

---

## Phase 4 — Buyer Engagement (Favorites, Inquiries, Realtime Chat)

**Goal:** authenticated buyer actions + live messaging.

**Scope / deliverables**
- **Favorites:** toggle on detail/search cards (idempotent add/remove), `/favorites` dashboard page with embedded property previews + pagination.
- **Inquiries:** send inquiry from detail page (message 5–2000), buyer's `/inquiries` list + `/inquiries/:id` detail (buyer/owner/admin view), report-listing dialog (reason 5–500).
- **Realtime chat (Socket.IO):** `lib/socket.ts` client (auth via token); join/leave inquiry rooms; `message:send`/`message:received`; typing indicators; `notification:new_message` toast; render initial REST message then append live messages (ephemeral — no history).

**Endpoints covered:** `POST/DELETE /favorites/:propertyId`, `GET /favorites`, `POST /inquiries`, `GET /inquiries`, `GET /inquiries/:id`, `POST /inquiries/report/:propertyId`; Socket.IO events.

**Done when:** favorites persist, inquiries send + list + open, chat is live between two sessions with typing + notifications; verified in-browser.

---

## Phase 5 — Seller Listing Management

**Goal:** sellers create, edit, and manage listings + media.

**Scope / deliverables**
- Seller dashboard: `GET /properties` (own listings) with status filter (DRAFT/PENDING/APPROVED/SUSPENDED/ARCHIVED), pagination, `rejection_info` banner on rejected drafts.
- **Create/Edit listing form** — full property schema (bilingual titles/descriptions, price ETB/USD, transaction_mode, category, address fields, bedrooms/bathrooms/area, lat/lng, amenities[]). Zod mirrors backend.
- **Media manager:** upload images (field `images`, ≤10 → responsive WebP), upload documents (field `document`), delete media, rename scene (PATCH).
- **Submit for review:** DRAFT → PENDING; handle `REVISION_REQUIRED` (must edit rejected listing before resubmit).
- **Listing stats:** favorites/inquiries counts. Delete → ARCHIVED.
- **Received inquiries:** `/inquiries/received` with status filter + status updates (NEW/IN_PROGRESS/RESOLVED/DISMISSED).

**Endpoints covered:** `POST /properties`, `PUT /properties/:id`, `DELETE /properties/:id`, `POST /properties/:id/submit`, `GET /properties`, `GET /properties/:id/stats`, `POST /properties/:id/media/images`, `POST /properties/:id/media/documents`, `DELETE /properties/:id/media/:mediaId`, `PATCH /properties/:id/media/:mediaId`, `GET /inquiries/received`, `PATCH /inquiries/:id/status`.

**Done when:** full listing lifecycle works (create→media→submit→edit→archive), received inquiries manageable, exact multipart field names honored; verified in-browser.

---

## Phase 6 — Tour Builder (Scenes, Hotspots, Floor Plans)

**Goal:** sellers build the 360° tours consumed in Phase 3.

**Scope / deliverables**
- **Scene upload:** panorama upload (field `file`, JPEG/PNG, 2:1 ratio) with `scene_name`/`initial_yaw` passed as **query string**; client-side 2:1 ratio pre-check + handle 422 `INVALID_PANORAMA_RATIO`; show `needs_repair` pending state.
- **Scene reorder** (`PATCH /properties/:id/tour/reorder`).
- **Hotspot editor:** place NAVIGATION (requires `target_scene_id`, not self) + INFO (requires `label`) hotspots on the panorama (yaw 0–360, pitch −90..90); create/update/delete.
- **Floor plan:** upload (field `file` image/PDF or `{ file_url }`); **pin placement** UI setting `fp_x`/`fp_y` (0–100%) per scene via `PATCH /media/:id`.

**Endpoints covered:** `POST /properties/:id/media/tour-scene`, `PATCH /properties/:id/tour/reorder`, `POST /properties/:id/floor-plan`, `POST /hotspots`, `PATCH /hotspots/:id`, `DELETE /hotspots/:id`, `PATCH /media/:id`.

**Done when:** a seller can build a multi-scene tour with navigation/info hotspots + floor-plan pins, and it renders correctly in the Phase 3 viewer; verified in-browser.

---

## Phase 7 — Agency Management

**Goal:** agency registration, team, and analytics.

**Scope / deliverables**
- **Agency registration:** `POST /agencies` (multipart, field `business_license` + `agency_name`) → unapproved pending state.
- **Agency profile page:** `GET /agencies/:id` (public) + edit (`PUT`, name/logo).
- **Team management:** invite by email (`POST /agencies/:id/invite`), employee list, remove employee.
- **Agency analytics dashboard:** totals + per-agent breakdown.
- Agent surfaces: agents manage listings (reuse Phase 5/6) within the agency; view employees.

**Endpoints covered:** `POST /agencies`, `GET /agencies/:id`, `PUT /agencies/:id`, `POST /agencies/:id/invite`, `GET /agencies/:id/employees`, `DELETE /agencies/:id/employees/:userId`, `GET /agencies/:id/analytics`.

**Done when:** agency can register, manage team, and view analytics; role elevation (AGENCY_ADMIN) reflected after admin approval; verified in-browser.

---

## Phase 8 — Payments & Promotions

**Goal:** promote listings via Chapa + invoice history.

**Scope / deliverables**
- **Promote flow:** choose tier (HOMEPAGE_FEATURED 2500 / SEARCH_BOOST 1500 / PREMIUM_BADGE 800 ETB) + currency → `POST /payments/initiate` → redirect to `checkout_url`.
- **Return handling:** after Chapa redirect back, poll `GET /payments/invoices/:id` until `COMPLETED`/`FAILED` (webhook is server-side; frontend never calls it).
- **Invoices page:** `GET /payments/invoices` (paginated, status filter) + detail; featured badges shown on promoted listings across the app.

**Endpoints covered:** `POST /payments/initiate`, `GET /payments/invoices`, `GET /payments/invoices/:id`.

**Done when:** promotion checkout redirects, invoice status polling resolves, invoice history displays, featured styling appears; verified in-browser.

---

## Phase 9 — User Profile & Settings

**Goal:** account self-management.

**Scope / deliverables**
- Profile page: `GET /users/me` (incl. profile), edit (`PUT /users/me`: full_name, preferred_language en/am, phone_number, email).
- Avatar upload (field `avatar`), ID-document upload for verification (field `document`) with verification status display.
- Notification preferences (`PUT /users/me/notifications`).
- Language toggle (en/am) wired to `preferred_language`.
- Delete account (`DELETE /users/me`) with confirmation (blocked for agency admins — handle 4xx).

**Endpoints covered:** `GET /users/me`, `PUT /users/me`, `DELETE /users/me`, `POST /users/me/avatar`, `POST /users/me/id-document`, `PUT /users/me/notifications`.

**Done when:** profile edits, uploads, notification prefs, language, and account deletion all work with correct guards; verified in-browser.

---

## Phase 10 — Admin Console

**Goal:** full platform moderation & oversight.

**Scope / deliverables**
- **Dashboard:** `GET /admin/dashboard` — users by role, properties by category, revenue, pending counts (charts).
- **Property moderation:** pending queue, approve, suspend (reason), reject (reason → back to DRAFT with feedback).
- **User management:** list (filter role/search), detail (`_count.properties`), ban (reason), verify identity, change role.
- **Agency moderation:** pending queue, approve (elevates admin), reject (reason).
- **Audit logs:** `GET /admin/audit-logs` with filters (action, target_table, actor_id) + pagination.

**Endpoints covered:** all `/admin/*` (13 endpoints).

**Done when:** admin can moderate properties/agencies, manage users, view dashboard + audit logs; all actions reflect on the relevant surfaces; verified in-browser.

---

## Phase 11 — Hardening & Production Readiness

**Goal:** polish, resilience, and ship-readiness across the whole app.

**Scope / deliverables**
- End-to-end RBAC pass across all routes vs the Role→Feature matrix.
- Global error/empty/loading consistency; offline/timeout handling; retry policy.
- Security headers in `next.config`, input sanitization review, no token leakage.
- Accessibility pass (semantic HTML, ARIA, keyboard, contrast), responsive/mobile QA.
- SEO/metadata, Open Graph for listings, sitemap for public pages.
- Performance: image optimization, SWR cache tuning, code-splitting, Web Vitals check.
- Bilingual (en/am) coverage review.
- Final full-app browser verification of every endpoint integration.

**Done when:** all endpoints integrated and exercised, RBAC correct, a11y + performance + security baselines met.

---

## Endpoint Coverage Map (every endpoint → phase)

| Module | Endpoints | Phase |
|---|---|---|
| Auth (12) | register, login, logout, send-otp, verify-otp, forgot/reset-password, change-password, google(+callback), refresh, me | 1 (me bootstrap in 0) |
| Users (6) | me GET/PUT/DELETE, avatar, id-document, notifications | 9 |
| Agencies (7) | create, get, update, invite, employees GET/DELETE, analytics | 7 |
| Properties — public (3) | search, get, tour | 2 (tour viewer in 3) |
| Properties — owner (10) | create, update, delete, submit, list own, stats, media images/documents, media DELETE/PATCH | 5 |
| Properties — tour build (3) | tour-scene, tour/reorder, floor-plan | 6 |
| Favorites (3) | add, remove, list | 4 |
| Inquiries (6) | create, sent list, received, get, status, report | 4 (received + status in 5) |
| Payments (3 usable) | initiate, invoices list, invoice get (webhook = server-only) | 8 |
| Admin (13) | pending props, approve/suspend/reject, users list/get/ban/verify/role, agencies pending/approve/reject, audit-logs, dashboard | 10 |
| Hotspots (3) | create, update, delete | 6 |
| Media (1 usable) | PATCH :id (media?needs_repair = internal only) | 6 |
| Realtime | Socket.IO inquiry chat events | 4 |

Every frontend-facing endpoint is assigned to a phase; the two internal-only endpoints (`chapa-webhook`, `GET /media?needs_repair`) are intentionally excluded from the frontend.
