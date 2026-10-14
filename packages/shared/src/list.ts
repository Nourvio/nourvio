import { z } from "zod"

import { isoDate } from "./plan.ts"
import { STORE_SECTION_IDS, type StoreSectionId } from "./stores.ts"

export const LIST_SOURCES = ["plan", "manual", "weekly"] as const
export type ListSource = (typeof LIST_SOURCES)[number]

export type ShoppingItem = {
  id: string
  name: string
  /** "1 ½ lb", "2 cans", "2 × 12-pack", or empty. */
  amount: string
  quantity: number | null
  unitId: string | null
  sectionId: StoreSectionId
  checked: boolean
  source: ListSource
  /** The recipes it's for. */
  recipes: string[]
}

/** Something bought every week whatever's planned, like Diet Pepsi. */
export type WeeklyItem = {
  id: string
  name: string
  amount: string | null
  sectionId: StoreSectionId
}

/** Things assumed to be at home, left off lists made from the plan. */
export const DEFAULT_ON_HAND = [
  "salt",
  "black pepper",
  "pepper",
  "salt and pepper",
  "water",
  "ice",
]

export const addListItemInput = z.object({
  /** As typed: "2 lb ground beef" or "paper towels". */
  text: z.string().trim().min(1, "Type an item").max(200),
})

export const updateListItemInput = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  /** Free text; amounts like "2 lb" are understood. Empty clears it. */
  amount: z.string().trim().max(60).optional(),
  sectionId: z.enum(STORE_SECTION_IDS).optional(),
  checked: z.boolean().optional(),
})
export type UpdateListItemInput = z.infer<typeof updateListItemInput>

export const addFromPlanInput = z.object({ from: isoDate, to: isoDate })

export type AddFromPlanResult = {
  /** Planned meals added this time. */
  meals: number
  /** New lines on the list. */
  added: number
  /** Lines that already were on the list and got more. */
  merged: number
  /** Every-week items added. */
  weekly: number
  /** Ingredients left off because they're always on hand. */
  onHand: string[]
  /** Ingredients left off because they're in the pantry. */
  inPantry: string[]
}

export const onHandInput = z.object({
  items: z.array(z.string().trim().min(1).max(60)).max(200),
})

export const weeklyItemInput = z.object({
  name: z.string().trim().min(1, "Name the item").max(100),
  amount: z.string().trim().max(60).nullable().optional(),
  sectionId: z.enum(STORE_SECTION_IDS).optional(),
})
export type WeeklyItemInput = z.infer<typeof weeklyItemInput>
