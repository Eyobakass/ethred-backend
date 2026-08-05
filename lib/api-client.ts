import { config } from "./config"

/** A field-level validation error (from a 422 Zod failure). */
export interface FieldError {
  field: string
  message: string
}

/** Normalized API error thrown by the client. */
export class ApiError extends Error {
  status: number
  /** Field errors from 422 responses, keyed for form binding. */
  fieldErrors: FieldError[]
  /** Optional machine code surfaced in the message (e.g. REVISION_REQUIRED). */
  code?: string

  constructor(
    message: string,
    status: number,
    fieldErrors: FieldError[] = [],
    code?: string,
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.fieldErrors = fieldErrors
    this.code = code
  }

  /** Map of field -> message for react-hook-form setError. */
  get fieldErrorMap(): Record<string, string> {
    return this.fieldErrors.reduce<Record<string, string>>((acc, e) => {
      acc[e.field] = e.message
      return acc
    }, {})
  }
}

/* ---- token storage (memory + localStorage mirror) ---- */

const TOKEN_KEY = "ethred_jwt"
let memoryToken: string | null = null

export function setToken(token: string | null) {
  memoryToken = token
  if (typeof window !== "undefined") {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  }
}

export function getToken(): string | null {
  if (memoryToken) return memoryToken
  if (typeof window !== "undefined") {
    memoryToken = window.localStorage.getItem(TOKEN_KEY)
  }
  return memoryToken
}

/* ---- machine codes commonly returned in `message` ---- */
const KNOWN_CODES = [
  "REVISION_REQUIRED",
  "NO_TOUR_AVAILABLE",
  "SCENE_NOT_FOUND",
  "INVALID_PANORAMA_RATIO",
]

function extractCode(message: string, explicit?: string): string | undefined {
  if (explicit) return explicit
  return KNOWN_CODES.find((c) => message?.includes(c))
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** JSON body (object) — serialized automatically. Ignored if `formData` is set. */
  body?: unknown
  /** Raw FormData for multipart uploads (do NOT set Content-Type manually). */
  formData?: FormData
  /** Query params appended to the URL. */
  params?: Record<string, string | number | boolean | undefined | null>
  /** Skip attaching the Authorization header. */
  skipAuth?: boolean
}

function buildUrl(
  path: string,
  params?: RequestOptions["params"],
): string {
  const base = path.startsWith("http") ? path : `${config.apiBase}${path}`
  if (!params) return base
  const url = new URL(base)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

/**
 * Core request wrapper.
 * - Prefixes the API base, attaches Bearer token, sends credentials.
 * - Unwraps the `{ success, ... }` envelope and normalizes errors.
 */
export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, formData, params, skipAuth, headers, ...rest } = options

  const finalHeaders = new Headers(headers)
  if (!skipAuth) {
    const token = getToken()
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`)
  }

  let payload: BodyInit | undefined
  if (formData) {
    payload = formData // browser sets multipart boundary
  } else if (body !== undefined) {
    finalHeaders.set("Content-Type", "application/json")
    payload = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(buildUrl(path, params), {
      ...rest,
      headers: finalHeaders,
      body: payload,
      credentials: "include",
    })
  } catch {
    throw new ApiError("Network error — please check your connection.", 0)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T

  const contentType = res.headers.get("content-type") || ""
  const isJson = contentType.includes("application/json")
  const data = isJson ? await res.json().catch(() => null) : await res.text()

  if (!res.ok) {
    const msg =
      (isJson && (data?.message as string)) ||
      (typeof data === "string" && data) ||
      res.statusText ||
      "Request failed"
    const fieldErrors: FieldError[] =
      isJson && Array.isArray(data?.errors) ? data.errors : []
    const code = extractCode(msg, isJson ? data?.field : undefined)
    throw new ApiError(msg, res.status, fieldErrors, code)
  }

  return data as T
}

/** SWR fetcher — `key` is the API path (with optional query string). */
export const fetcher = <T = unknown>(path: string) => apiRequest<T>(path)

export const api = {
  get: <T = unknown>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "GET" }),
  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "PUT", body }),
  patch: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "PATCH", body }),
  delete: <T = unknown>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
  upload: <T = unknown>(
    path: string,
    formData: FormData,
    options?: RequestOptions,
  ) => apiRequest<T>(path, { ...options, method: "POST", formData }),
}
