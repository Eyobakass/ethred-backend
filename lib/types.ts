// TypeScript models mirroring the Ethred Prisma schema and API response shapes.
// See BACKEND_ARCHITECTURE.md for the source of truth.

export type UserRole =
  | "BUYER"
  | "SELLER"
  | "AGENCY_ADMIN"
  | "AGENCY_AGENT"
  | "ADMIN"

export type PreferredLanguage = "en" | "am"

export type PropertyCategory =
  | "HOUSE"
  | "APARTMENT"
  | "LAND"
  | "COMMERCIAL"
  | "OFFICE"
  | "WAREHOUSE"
  | "VACATION"

export type PropertyStatus =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "SUSPENDED"
  | "ARCHIVED"

export type TransactionMode = "SALE" | "RENT"

export type PromotionTier =
  | "HOMEPAGE_FEATURED"
  | "SEARCH_BOOST"
  | "PREMIUM_BADGE"

export type Currency = "ETB" | "USD"

export type InquiryStatus = "NEW" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED"

export type InvoiceStatus = "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED"

export type MediaCategory = "IMAGE" | "VIDEO" | "DOCUMENT"

export type HotspotType = "NAVIGATION" | "INFO"

/** Minimal user attached to sessions (`/auth/me`, `req.user`). */
export interface SessionUser {
  id: string
  email: string | null
  phone_number: string | null
  role: UserRole
  is_phone_verified: boolean
}

export interface Profile {
  user_id: string
  full_name: string
  avatar_url?: string | null
  preferred_language: PreferredLanguage
}

/** Full user (`/users/me`). */
export interface User {
  id: string
  email: string | null
  phone_number: string | null
  role: UserRole
  is_phone_verified: boolean
  is_identity_verified: boolean
  created_at: string
  updated_at: string
  profile?: Profile | null
}

export interface Agency {
  id: string
  admin_id: string
  agency_name: string
  logo_url?: string | null
  business_license_url?: string | null
  is_approved: boolean
  created_at: string
  employees?: AgencyEmployee[]
}

export interface AgencyEmployee {
  agency_id: string
  user_id: string
  assigned_role: string
  user?: Pick<User, "id" | "email"> & { profile?: Profile | null }
}

export interface PropertyMedia {
  id: string
  property_id: string
  file_url: string
  media_category: MediaCategory
  sort_order: number
  created_at: string
  is_tour_scene: boolean
  scene_name?: string | null
  initial_yaw?: number | null
  needs_repair: boolean
  fp_x?: number | null
  fp_y?: number | null
}

export interface PropertyAmenity {
  property_id: string
  amenity_name: string
}

export interface Hotspot {
  id: string
  scene_id: string
  type: HotspotType
  yaw: number
  pitch: number
  target_scene_id?: string | null
  label?: string | null
  created_at: string
  updated_at: string
}

export interface RejectionInfo {
  reason: string
  rejected_at?: string
}

export interface Property {
  id: string
  owner_id: string
  agency_id?: string | null
  title_en: string
  title_am?: string | null
  description_en: string
  description_am?: string | null
  /** Decimals arrive as strings from the API — coerce before math. */
  price_etb: string
  price_usd?: string | null
  transaction_mode: TransactionMode
  category: PropertyCategory
  region: string
  city: string
  sub_city: string
  woreda: string
  kebele?: string | null
  nearest_landmark?: string | null
  bedrooms: number
  bathrooms: number
  area_sqm: string
  status: PropertyStatus
  is_featured: boolean
  featured_tier?: PromotionTier | null
  featured_until?: string | null
  external_tour_url?: string | null
  floor_plan_url?: string | null
  created_at: string
  updated_at: string
  thumbnail_url?: string | null
  media?: PropertyMedia[]
  amenities?: PropertyAmenity[]
  owner?: Pick<User, "id" | "email"> & { profile?: Profile | null }
  agency?: Agency | null
  rejection_info?: RejectionInfo | null
}

export interface Inquiry {
  id: string
  property_id: string
  buyer_id: string
  message: string
  status: InquiryStatus
  created_at: string
  property?: Property
  buyer?: Pick<User, "id" | "email"> & { profile?: Profile | null }
}

export interface Favorite {
  user_id: string
  property_id: string
  property?: Property
}

export interface BillingInvoice {
  id: string
  user_id: string
  amount: string
  currency: Currency
  tx_ref: string
  payment_processor: string
  status: InvoiceStatus
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  actor_id?: string | null
  action: string
  target_table: string
  target_id?: string | null
  old_values?: Record<string, unknown> | null
  new_values?: Record<string, unknown> | null
  created_at: string
}

/* ---- Response envelopes ---- */

export interface Paginated<T> {
  results: T[]
  count: number
  page: number
  limit: number
}

/* ---- Tour config (GET /properties/:id/tour) ---- */

export interface TourHotspot {
  id: string
  pitch: number
  yaw: number
  type: "scene" | "info"
  text?: string
  sceneId?: string
  cssClass?: string
}

export interface TourScene {
  title: string
  type: "equirectangular"
  panorama: string
  yaw: number
  fp_x?: number
  fp_y?: number
  hotSpots: TourHotspot[]
}

export interface TourConfig {
  default: {
    firstScene: string
    sceneFadeDuration: number
    autoLoad: boolean
    showControls: boolean
    keyboardZoom: boolean
  }
  scenes: Record<string, TourScene>
  meta: {
    property_id: string
    scene_count: number
    external_tour_url?: string | null
    floor_plan_url?: string | null
  }
}
