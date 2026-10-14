import { z } from "zod"

/** What a tidy-up can touch. Each one can be applied or skipped on its own. */
export const CLEANUP_SECTIONS = [
  "description",
  "tags",
  "details",
  "ingredients",
  "steps",
] as const
export type CleanupSection = (typeof CLEANUP_SECTIONS)[number]

export const CLEANUP_SECTION_NAMES: Record<CleanupSection, string> = {
  description: "Description",
  tags: "Tags",
  details: "Servings and times",
  ingredients: "Ingredients",
  steps: "Steps",
}

export type RecipeDetails = {
  servings: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  totalMinutes: number | null
}

/** Section values, before or after. Only sections that change are present. */
export type CleanupValues = {
  description?: string | null
  tags?: string[]
  details?: RecipeDetails
  ingredients?: string[]
  steps?: string[]
}

export const PROPOSAL_STATUSES = [
  "pending",
  "applied",
  "dismissed",
  /** The AI found nothing to change. Kept so a library run skips the recipe. */
  "unchanged",
] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

export type Proposal = {
  id: string
  kind: "cleanup"
  status: ProposalStatus
  recipe: { id: string; slug: string; name: string }
  /** One sentence from the AI on what it changed. */
  summary: string
  before: CleanupValues
  after: CleanupValues
  createdAt: string
}

export const cleanupInput = z.object({
  sections: z
    .array(z.enum(CLEANUP_SECTIONS))
    .min(1, "Pick at least one thing to tidy")
    .default([...CLEANUP_SECTIONS]),
})

export const applyProposalInput = z.object({
  sections: z
    .array(z.enum(CLEANUP_SECTIONS))
    .min(1, "Pick at least one change to keep"),
})

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
