import { z } from "zod"

import { MEALS, type Meal } from "./plan.ts"
import type { HouseholdTastes } from "./tastes.ts"
import {
  displayNameSchema,
  passwordSchema,
  ROLES,
  usernameSchema,
  type Role,
} from "./users.ts"

/**
 * A household shares one recipe library, plan, pantry and list. A server can
 * hold several; each account belongs to one.
 */
export type Household = {
  id: string
  name: string
  /** Tidy every new import automatically; the suggestions wait for review. */
  autoCleanup: boolean
  /** The meals the plan shows, in day order. */
  meals: Meal[]
  /** 0 for Sunday, 1 for Monday. */
  weekStart: 0 | 1
  /** Always at home, so left off lists made from the plan. */
  onHand: string[]
  /** What the household eats and doesn't: suggestions and the assistant follow it. */
  tastes: HouseholdTastes
}

export const householdNameSchema = z
  .string()
  .trim()
  .min(1, "Give the household a name")
  .max(60, "Keep it under 60 characters")

export const updateHouseholdInput = z.object({
  name: householdNameSchema.optional(),
  autoCleanup: z.boolean().optional(),
  meals: z.array(z.enum(MEALS)).min(1, "Plan at least one meal").optional(),
  weekStart: z.union([z.literal(0), z.literal(1)]).optional(),
  onHand: z.array(z.string().trim().min(1).max(60)).max(200).optional(),
})
export type UpdateHouseholdInput = z.infer<typeof updateHouseholdInput>

/** How long an invite link works. */
export const INVITE_DAYS = 7

export type Invite = {
  id: string
  role: Role
  createdBy: string | null
  createdAt: string
  expiresAt: string
}

/** Only returned once, when the invite is made: the link can't be shown again. */
export type CreatedInvite = Invite & { token: string }

export const createInviteInput = z.object({
  role: z.enum(ROLES).default("member"),
})

/** What someone opening an invite link sees before joining. */
export type InvitePreview = {
  householdName: string
  invitedBy: string | null
  role: Role
  expiresAt: string
}

export const joinInput = z.object({
  displayName: displayNameSchema,
  username: usernameSchema,
  password: passwordSchema,
})
export type JoinInput = z.infer<typeof joinInput>

/** Open sign-up starts a new household, with the new person as its admin. */
export const signupInput = joinInput.extend({
  householdName: householdNameSchema,
})
export type SignupInput = z.infer<typeof signupInput>

/** Settings for the whole server, which only the server admin can change. */
export type ServerSettings = {
  /** Anyone who reaches Mise can create an account (and a household). */
  signupOpen: boolean
}

export const updateServerSettingsInput = z.object({
  signupOpen: z.boolean().optional(),
})

/** A household as the server admin sees it. */
export type HouseholdSummary = {
  id: string
  name: string
  members: number
  recipes: number
  createdAt: string
  /** AI requests and rough cost this month, on the server's keys. */
  aiRequests: number
  aiCostUsd: number | null
  isYours: boolean
}
