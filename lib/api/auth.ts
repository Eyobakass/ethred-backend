import { api, setToken } from "@/lib/api-client"
import type { SessionUser } from "@/lib/types"

interface AuthResponse {
  success: true
  user: SessionUser
  token: string
  jwt: string
  message?: string
  isNew?: boolean
}

interface OtpSendResponse {
  success: true
  session_token: string
  message?: string
}

function persist(res: AuthResponse): SessionUser {
  // Prefer the raw jwt for Bearer transport (see BACKEND_ARCHITECTURE.md §2).
  setToken(res.jwt || res.token)
  return res.user
}

export const authApi = {
  async register(input: {
    email: string
    password: string
    full_name: string
    preferred_language?: "en" | "am"
    role?: "BUYER" | "SELLER" | "AGENCY_ADMIN"
  }): Promise<SessionUser> {
    const res = await api.post<AuthResponse>("/auth/register", input, {
      skipAuth: true,
    })
    return persist(res)
  },

  async login(email: string, password: string): Promise<SessionUser> {
    const res = await api.post<AuthResponse>(
      "/auth/login",
      { email, password },
      { skipAuth: true },
    )
    return persist(res)
  },

  async logout(): Promise<void> {
    try {
      await api.post("/auth/logout")
    } finally {
      setToken(null)
    }
  },

  async sendOtp(email: string): Promise<string> {
    const res = await api.post<OtpSendResponse>(
      "/auth/send-otp",
      { email },
      { skipAuth: true },
    )
    return res.session_token
  },

  async verifyOtp(
    session_token: string,
    verification_code: string,
  ): Promise<{ user: SessionUser; isNew: boolean }> {
    const res = await api.post<AuthResponse>(
      "/auth/verify-otp",
      { session_token, verification_code },
      { skipAuth: true },
    )
    return { user: persist(res), isNew: Boolean(res.isNew) }
  },

  async forgotPassword(email: string): Promise<void> {
    await api.post("/auth/forgot-password", { email }, { skipAuth: true })
  },

  async resetPassword(token: string, password: string): Promise<void> {
    await api.post(
      "/auth/reset-password",
      { token, password },
      { skipAuth: true },
    )
  },

  async changePassword(
    current_password: string,
    new_password: string,
  ): Promise<void> {
    await api.put("/auth/change-password", { current_password, new_password })
  },

  async refresh(): Promise<SessionUser | null> {
    try {
      const res = await api.post<AuthResponse>("/auth/refresh")
      return persist(res)
    } catch {
      setToken(null)
      return null
    }
  },

  async me(): Promise<SessionUser> {
    const res = await api.get<{ success: true; user: SessionUser }>("/auth/me")
    return res.user
  },

  /** Full URL to begin Google OAuth (browser navigation, not fetch). */
  googleUrl(): string {
    // Uses the API base so cookies/redirects are handled server-side.
    return `${
      process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
      "http://localhost:5000"
    }${process.env.NEXT_PUBLIC_API_PREFIX || "/api/v1"}/auth/google`
  },
}
