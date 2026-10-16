// One file per table, named after the table.

import { Account } from "./accounts.ts"
import { AiKey } from "./ai_keys.ts"
import { AiUsage } from "./ai_usage.ts"
import { ApiKey } from "./api_keys.ts"
import { Aisle } from "./aisles.ts"
import { CookNote } from "./cook_notes.ts"
import { EmailInvitation } from "./email_invitations.ts"
import { FoodPlacement } from "./food_placements.ts"
import { HouseholdMember } from "./household_members.ts"
import { HouseholdSetting } from "./household_settings.ts"
import { Household } from "./households.ts"
import { InviteLink } from "./invite_links.ts"
import { Job } from "./jobs.ts"
import { PantryItem } from "./pantry_items.ts"
import { PlanEntry } from "./plan_entries.ts"
import { Purchase } from "./purchases.ts"
import { RateLimit } from "./rate_limits.ts"
import { RecipeIngredient } from "./recipe_ingredients.ts"
import { RecipePairing } from "./recipe_pairings.ts"
import { RecipeStep } from "./recipe_steps.ts"
import { RecipeTag } from "./recipe_tags.ts"
import { RecipeVersion } from "./recipe_versions.ts"
import { Recipe } from "./recipes.ts"
import { Secret } from "./secrets.ts"
import { ServerSetting } from "./server_settings.ts"
import { Session } from "./sessions.ts"
import { ShoppingItem } from "./shopping_items.ts"
import { ShoppingList } from "./shopping_lists.ts"
import { Tag } from "./tags.ts"
import { User } from "./users.ts"
import { Verification } from "./verifications.ts"
import { WeeklyItem } from "./weekly_items.ts"

export * from "./accounts.ts"
export * from "./ai_keys.ts"
export * from "./ai_usage.ts"
export * from "./api_keys.ts"
export * from "./aisles.ts"
export * from "./cook_notes.ts"
export * from "./email_invitations.ts"
export * from "./food_placements.ts"
export * from "./household_members.ts"
export * from "./household_settings.ts"
export * from "./households.ts"
export * from "./invite_links.ts"
export * from "./jobs.ts"
export * from "./pantry_items.ts"
export * from "./plan_entries.ts"
export * from "./purchases.ts"
export * from "./rate_limits.ts"
export * from "./recipe_ingredients.ts"
export * from "./recipe_pairings.ts"
export * from "./recipe_steps.ts"
export * from "./recipe_tags.ts"
export * from "./recipe_versions.ts"
export * from "./recipes.ts"
export * from "./secrets.ts"
export * from "./server_settings.ts"
export * from "./sessions.ts"
export * from "./shopping_items.ts"
export * from "./shopping_lists.ts"
export * from "./tags.ts"
export * from "./users.ts"
export * from "./verifications.ts"
export * from "./weekly_items.ts"

/** Every entity. A new one goes here, or the database won't know about it. */
export const entities = [
  Account,
  AiKey,
  AiUsage,
  ApiKey,
  Aisle,
  CookNote,
  EmailInvitation,
  FoodPlacement,
  Household,
  HouseholdMember,
  HouseholdSetting,
  InviteLink,
  Job,
  PantryItem,
  PlanEntry,
  Purchase,
  RateLimit,
  Recipe,
  RecipeIngredient,
  RecipePairing,
  RecipeStep,
  RecipeTag,
  RecipeVersion,
  Secret,
  ServerSetting,
  Session,
  ShoppingItem,
  ShoppingList,
  Tag,
  User,
  Verification,
  WeeklyItem,
]

/**
 * Tables that belong to no household. Every other table must be
 * household-owned, which a test checks.
 */
export const SHARED_TABLES = [
  "accounts",
  "households",
  // The runner sees every household's; the job services check the household.
  "jobs",
  "rate_limits",
  // The server's own keys and each household's, found by whose they are.
  "ai_keys",
  // Reached only through the settings that point at them.
  "secrets",
  "server_settings",
  "sessions",
  "users",
  "verifications",
]
