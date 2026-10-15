import { z } from "zod"

import { isoDate, MEALS, PLAN_STATUSES } from "./plan.ts"
import { STORE_SECTION_IDS } from "./stores.ts"

/** Things picked in select mode, by id. */
const ids = z
  .array(z.uuid())
  .min(1, "Pick something first")
  .max(500, "Up to 500 at a time")

const tags = z.array(z.string().trim().min(1).max(40)).min(1).max(20)

/** What can be done to selected recipes (`POST /api/recipes/bulk`). */
export const recipeBulkInput = z.discriminatedUnion("action", [
  /** To Recently deleted, for 30 days. */
  z.object({ action: z.literal("delete"), ids }),
  /** Back from Recently deleted. */
  z.object({ action: z.literal("restore"), ids }),
  /** Gone for good, from Recently deleted. */
  z.object({ action: z.literal("purge"), ids }),
  z.object({ action: z.literal("addTags"), ids, tags }),
  z.object({ action: z.literal("removeTags"), ids, tags }),
  /** Work out nutrition, make photos or tidy up, in the background. */
  z.object({ action: z.literal("nutrition"), ids }),
  z.object({ action: z.literal("photos"), ids }),
  z.object({ action: z.literal("tidy"), ids }),
  /** Their ingredients onto the shopping list. */
  z.object({ action: z.literal("toList"), ids }),
])
export type RecipeBulkInput = z.infer<typeof recipeBulkInput>

/** What can be done to selected list items (`POST /api/list/bulk`). */
export const listBulkInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), ids }),
  z.object({
    action: z.literal("move"),
    ids,
    listId: z.string().min(1).max(60),
  }),
  z.object({
    action: z.literal("aisle"),
    ids,
    sectionId: z.enum(STORE_SECTION_IDS),
  }),
  /** Bought every week from now on. */
  z.object({ action: z.literal("weekly"), ids }),
])
export type ListBulkInput = z.infer<typeof listBulkInput>

/** What can be done to selected pantry items (`POST /api/pantry/bulk`). */
export const pantryBulkInput = z.discriminatedUnion("action", [
  /** Used up: out of the pantry. */
  z.object({ action: z.literal("delete"), ids }),
  z.object({
    action: z.literal("aisle"),
    ids,
    sectionId: z.enum(STORE_SECTION_IDS),
  }),
  z.object({ action: z.literal("useBy"), ids, useBy: isoDate.nullable() }),
  /** Onto the shopping list again. */
  z.object({ action: z.literal("toList"), ids }),
])
export type PantryBulkInput = z.infer<typeof pantryBulkInput>

/** What can be done to selected planned meals (`POST /api/plan/bulk`). */
export const planBulkInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), ids }),
  /** To another day, keeping the meal unless one is given. */
  z.object({
    action: z.literal("move"),
    ids,
    date: isoDate,
    meal: z.enum(MEALS).optional(),
  }),
  z.object({ action: z.literal("status"), ids, status: z.enum(PLAN_STATUSES) }),
  /** Their ingredients onto the shopping list. */
  z.object({ action: z.literal("toList"), ids }),
])
export type PlanBulkInput = z.infer<typeof planBulkInput>

/** Whole-week actions on the plan (`POST /api/plan/week`). */
export const planWeekInput = z.discriminatedUnion("action", [
  /** Last week's meals onto the same days of this one, where they're empty. */
  z.object({ action: z.literal("repeat"), start: isoDate }),
  /** Everything planned from `from` to the end of the week comes off. */
  z.object({ action: z.literal("clear"), from: isoDate, to: isoDate }),
])
export type PlanWeekInput = z.infer<typeof planWeekInput>

/** What a bulk action changed. */
export type BulkResult = { changed: number }
