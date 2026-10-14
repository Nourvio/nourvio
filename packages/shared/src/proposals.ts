import { z } from "zod"

import type { Meal } from "./plan.ts"
import type { RecipeInput } from "./recipes.ts"

/**
 * The parts of a recipe a suggested change can touch. Each one can be applied
 * or skipped on its own.
 */
export const RECIPE_SECTIONS = [
  "name",
  "description",
  "tags",
  "details",
  "ingredients",
  "steps",
  "notes",
] as const
export type RecipeSection = (typeof RECIPE_SECTIONS)[number]

export const RECIPE_SECTION_NAMES: Record<RecipeSection, string> = {
  name: "Name",
  description: "Description",
  tags: "Tags",
  details: "Servings and times",
  ingredients: "Ingredients",
  steps: "Steps",
  notes: "Notes",
}

/** What a tidy-up can touch. */
export const CLEANUP_SECTIONS = [
  "description",
  "tags",
  "details",
  "ingredients",
  "steps",
] as const satisfies readonly RecipeSection[]
export type CleanupSection = (typeof CLEANUP_SECTIONS)[number]

export const CLEANUP_SECTION_NAMES: Record<CleanupSection, string> =
  RECIPE_SECTION_NAMES

export type RecipeDetails = {
  servings: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  totalMinutes: number | null
}

/** Section values, before or after. Only sections that change are present. */
export type RecipeValues = {
  name?: string
  description?: string | null
  tags?: string[]
  details?: RecipeDetails
  ingredients?: string[]
  steps?: string[]
  notes?: string | null
}
/** @deprecated Use RecipeValues. */
export type CleanupValues = RecipeValues

export const PROPOSAL_STATUSES = [
  "pending",
  "applied",
  "dismissed",
  /** The AI found nothing to change. Kept so a library run skips the recipe. */
  "unchanged",
] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

/**
 * - cleanup: a tidy-up of a recipe (Tidy up, auto-tidy, library runs, chat)
 * - recipe_edit: a change suggested in chat, such as a substitution
 * - new_recipe: a recipe worked out in chat, ready to save
 * - plan_meals: meals to add to the plan, from chat
 * - list_items: things to add to the shopping list, from chat
 */
export const PROPOSAL_KINDS = [
  "cleanup",
  "recipe_edit",
  "new_recipe",
  "plan_meals",
  "list_items",
] as const
export type ProposalKind = (typeof PROPOSAL_KINDS)[number]

type RecipeRef = { id: string; slug: string; name: string }

/** A meal a plan_meals proposal would add. */
export type ProposedMeal = {
  date: string
  meal: Meal
  recipe: RecipeRef | null
  /** What it's made with, like a sauce it goes with. */
  with?: RecipeRef | null
  note: string | null
  servings: number | null
}

export type Proposal = {
  id: string
  kind: ProposalKind
  status: ProposalStatus
  /** The recipe it changes. Null for a new recipe. */
  recipe: RecipeRef | null
  /** One sentence from the AI on what it changed. */
  summary: string
  before: RecipeValues
  after: RecipeValues
  /** The whole recipe, for a new one. */
  draft: RecipeInput | null
  /** For an edit that makes a different version ("dairy-free"), its name as a new recipe. */
  variantName: string | null
  /** The recipe created or changed when it was applied. */
  result: RecipeRef | null
  /** For plan_meals. */
  meals: ProposedMeal[] | null
  /** For list_items: lines as typed, "2 lb ground beef". */
  items: string[] | null
  createdAt: string
}

export const cleanupInput = z.object({
  sections: z
    .array(z.enum(CLEANUP_SECTIONS))
    .min(1, "Pick at least one thing to tidy")
    .default([...CLEANUP_SECTIONS]),
})

export const applyProposalInput = z.object({
  /** For changes to a recipe: which sections to keep. */
  sections: z
    .array(z.enum(RECIPE_SECTIONS))
    .min(1, "Pick at least one change to keep")
    .optional(),
  /** Save the changed recipe as a new one, leaving the original alone. */
  asNew: z.boolean().optional(),
})
export type ApplyProposalInput = z.infer<typeof applyProposalInput>

export type CleanupJob = {
  id: string
  status: "running" | "done" | "cancelled" | "failed" | "interrupted"
  total: number
  done: number
  failed: number
  /** Proposals waiting for review from this run. */
  proposals: number
  createdAt: string
  finishedAt: string | null
}
