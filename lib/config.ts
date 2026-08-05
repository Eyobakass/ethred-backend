// Central runtime config derived from public env vars.
// NEXT_PUBLIC_API_URL is the API *origin* (no /api/v1). The prefix is appended by the client.

const rawApiUrl =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000"

const apiPrefix = process.env.NEXT_PUBLIC_API_PREFIX || "/api/v1"

export const config = {
  /** API origin, e.g. http://localhost:5000 — used to prefix /uploads paths. */
  apiOrigin: rawApiUrl,
  /** Full API base, e.g. http://localhost:5000/api/v1 */
  apiBase: `${rawApiUrl}${apiPrefix}`,
  /** Socket.IO origin (defaults to API origin). */
  socketUrl:
    process.env.NEXT_PUBLIC_SOCKET_URL?.replace(/\/$/, "") || rawApiUrl,
} as const
