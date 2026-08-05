import { z } from "zod"

// Mirrors the backend Zod rules (min 8 password, strength, etc.).
// Kept intentionally close to BACKEND_ARCHITECTURE.md §5.1.

const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number")

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
})
export type LoginInput = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  full_name: z.string().min(2, "Enter your full name"),
  email: z.string().email("Enter a valid email"),
  password: strongPassword,
  preferred_language: z.enum(["en", "am"]).default("en"),
  role: z.enum(["BUYER", "SELLER", "AGENCY_ADMIN"]).default("BUYER"),
})
export type RegisterInput = z.infer<typeof registerSchema>

export const emailOnlySchema = z.object({
  email: z.string().email("Enter a valid email"),
})
export type EmailOnlyInput = z.infer<typeof emailOnlySchema>

export const otpVerifySchema = z.object({
  verification_code: z
    .string()
    .length(6, "Enter the 6-digit code")
    .regex(/^\d{6}$/, "Code must be 6 digits"),
})
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>

export const resetPasswordSchema = z
  .object({
    password: strongPassword,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Enter your current password"),
    new_password: strongPassword,
    confirm: z.string(),
  })
  .refine((d) => d.new_password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  })
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

/** Password strength score 0-4 for UX meter. */
export function passwordStrength(pw: string): {
  score: number
  label: string
} {
  let score = 0
  if (pw.length >= 8) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw) && pw.length >= 12) score++
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong"]
  return { score, label: labels[score] }
}
