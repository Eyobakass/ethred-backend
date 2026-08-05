"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import type { SessionUser, UserRole } from "@/lib/types"
import { authApi } from "@/lib/api/auth"
import { getToken, setToken } from "@/lib/api-client"

interface AuthContextValue {
  user: SessionUser | null
  loading: boolean
  isAuthenticated: boolean
  setUser: (user: SessionUser | null) => void
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  const bootstrap = useCallback(async () => {
    // Only attempt hydration if we might have a session (token or cookie).
    try {
      const token = getToken()
      if (token) {
        const me = await authApi.me()
        setUserState(me)
      } else {
        // Try cookie-based session via refresh; silent on failure.
        const refreshed = await authApi.refresh()
        setUserState(refreshed)
      }
    } catch {
      setUserState(null)
      setToken(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  const refresh = useCallback(async () => {
    const me = await authApi.me()
    setUserState(me)
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    setUserState(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: Boolean(user),
        setUser: setUserState,
        refresh,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>")
  return ctx
}

/** Default landing route for a given role after auth. */
export function roleHome(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "/admin"
    case "AGENCY_ADMIN":
    case "AGENCY_AGENT":
      return "/dashboard/listings"
    case "SELLER":
      return "/dashboard/listings"
    default:
      return "/"
  }
}
