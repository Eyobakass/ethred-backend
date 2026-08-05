import { config } from "./config"
import type { Currency, Property } from "./types"

/** Coerce a Prisma Decimal (string) or number into a number safely. */
export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === "number" ? value : Number.parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

/** Format a monetary amount with its currency. */
export function formatMoney(
  value: string | number | null | undefined,
  currency: Currency = "ETB",
): string {
  const amount = toNumber(value)
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(amount)
  return currency === "ETB" ? `ETB ${formatted}` : `$${formatted}`
}

export function formatArea(value: string | number | null | undefined): string {
  const n = toNumber(value)
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n)} m²`
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return ""
  const d = new Date(value).getTime()
  if (Number.isNaN(d)) return ""
  const diff = Date.now() - d
  const mins = Math.round(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(value)
}

/**
 * Resolve a media file_url to a loadable URL.
 * - base64 data URLs are returned as-is.
 * - /uploads/... paths are prefixed with the API origin.
 * - absolute http(s) URLs are returned as-is.
 */
export function mediaUrl(fileUrl: string | null | undefined): string {
  if (!fileUrl) return ""
  if (fileUrl.startsWith("data:") || fileUrl.startsWith("http")) return fileUrl
  const path = fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`
  return `${config.apiOrigin}${path}`
}

/** Compose a human-readable address from property location fields. */
export function composeAddress(p: Partial<Property>): string {
  return [p.woreda ? `Woreda ${p.woreda}` : null, p.sub_city, p.city, p.region]
    .filter(Boolean)
    .join(", ")
}

const CATEGORY_LABELS: Record<string, string> = {
  HOUSE: "House",
  APARTMENT: "Apartment",
  LAND: "Land",
  COMMERCIAL: "Commercial",
  OFFICE: "Office",
  WAREHOUSE: "Warehouse",
  VACATION: "Vacation",
}

export function categoryLabel(c: string | null | undefined): string {
  return c ? (CATEGORY_LABELS[c] ?? c) : "—"
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
}
