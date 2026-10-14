import { z } from "zod"

import { appearanceSchema, type Appearance } from "./appearance.ts"

/** A person's role in their household. Admins manage members and invites. */
export const ROLES = ["admin", "member"] as const
export type Role = (typeof ROLES)[number]

/** A household member, as the API returns them. Never includes the password hash. */
export type User = {
  id: string
  username: string
  displayName: string
  householdId: string
  role: Role
  /** Runs the server: AI keys, sign-up, other households, the Mealie import. */
  isServerAdmin: boolean
  appearance: Appearance
  createdAt: string
}

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9._-]{2,31}$/,
    "Use 3 to 32 letters, numbers, dots, dashes or underscores"
  )

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "Keep it under 200 characters")

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name")
  .max(60, "Keep it under 60 characters")

export const loginInput = z.object({
  username: z.string().trim().toLowerCase().min(1, "Enter your username"),
  password: z.string().min(1, "Enter your password"),
})

export const setupInput = z.object({
  code: z.string().trim().min(1, "Enter the setup code"),
  displayName: displayNameSchema,
  username: usernameSchema,
  password: passwordSchema,
  householdName: z
    .string()
    .trim()
    .min(1, "Give the household a name")
    .max(60, "Keep it under 60 characters"),
})

export const createUserInput = z.object({
  displayName: displayNameSchema,
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(ROLES).default("member"),
})

export const updateUserInput = z.object({
  displayName: displayNameSchema.optional(),
  role: z.enum(ROLES).optional(),
  password: passwordSchema.optional(),
})

export const updateMeInput = z.object({
  displayName: displayNameSchema.optional(),
  appearance: appearanceSchema.optional(),
})

export const changePasswordInput = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: passwordSchema,
})

export type LoginInput = z.infer<typeof loginInput>
export type SetupInput = z.infer<typeof setupInput>
export type CreateUserInput = z.input<typeof createUserInput>
export type UpdateUserInput = z.infer<typeof updateUserInput>
export type UpdateMeInput = z.infer<typeof updateMeInput>
export type ChangePasswordInput = z.infer<typeof changePasswordInput>

export type SetupStatus = {
  needsSetup: boolean
  /** Anyone can create an account (and their own household). */
  signupOpen: boolean
}
