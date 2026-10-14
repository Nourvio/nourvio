import { z } from "zod"

import { foodKey } from "./grocery.ts"
import { addDays, isoDate, type Meal, type PlanStatus } from "./plan.ts"
import { STORE_SECTION_IDS, type StoreSectionId } from "./stores.ts"

/** A planned meal a pantry item was bought for. */
export type PantryMeal = {
  id: string
  date: string
  meal: Meal
  /** The recipe's name. */
  name: string
  status: PlanStatus
}

export type PantryItem = {
  id: string
  name: string
  /** "2 lb", "half a bag", or empty for just "have it". */
  amount: string
  quantity: number | null
  unitId: string | null
  sectionId: StoreSectionId
  /** Optional, for food that goes off. */
  useBy: string | null
  /** The planned meals it was bought for. */
  meals: PantryMeal[]
  addedAt: string
}

export const addPantryItemInput = z.object({
  /** As typed: "2 lb chicken thighs" or "rice". */
  text: z.string().trim().min(1, "Type an item").max(200),
})

export const updatePantryItemInput = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  /** Free text; amounts like "2 lb" are understood. Empty means "have it". */
  amount: z.string().trim().max(60).optional(),
  sectionId: z.enum(STORE_SECTION_IDS).optional(),
  useBy: isoDate.nullable().optional(),
})
export type UpdatePantryItemInput = z.infer<typeof updatePantryItemInput>

export type PutAwayResult = {
  /** Checked items now in the pantry. */
  stored: number
  /** Checked items cleared without going in: household things and what's always on hand. */
  skipped: number
}

/** How many days ahead "use soon" looks. */
export const USE_SOON_DAYS = 2

/** About how long fresh food keeps, for a first guess at a use-by date. */
const KEEPS_DAYS: Partial<Record<StoreSectionId, number>> = {
  "meat-seafood": 3,
  deli: 5,
  bakery: 5,
  produce: 7,
}

/** Produce that keeps for weeks, so it gets no use-by guess. */
const LONG_KEEPING =
  /\b(onions?|garlic|potato(es)?|shallots?|squash|pumpkins?|cabbages?|carrots?|apples?|lemons?|limes?|oranges?|ginger|beets?)\b/

/** A first guess at when fresh food should be used by. Null for food that keeps. */
export function guessUseBy(
  name: string,
  sectionId: StoreSectionId,
  today: string
): string | null {
  const days = KEEPS_DAYS[sectionId]
  if (!days) return null
  if (sectionId === "produce" && LONG_KEEPING.test(name.toLowerCase())) {
    return null
  }
  return addDays(today, days)
}

export type UseSoonReason =
  | { kind: "past" | "soon"; date: string }
  | { kind: "leftover"; meals: PantryMeal[] }

/**
 * Why an item should be used soon, if it should: its use-by date is close or
 * gone, or the meals it was bought for were skipped or went by uncooked.
 */
export function whyUseSoon(
  item: Pick<PantryItem, "useBy" | "meals">,
  today: string
): UseSoonReason | null {
  if (item.useBy && item.useBy <= addDays(today, USE_SOON_DAYS)) {
    return { kind: item.useBy < today ? "past" : "soon", date: item.useBy }
  }
  const missed = item.meals.filter(
    (meal) =>
      meal.status === "skipped" ||
      (meal.status === "planned" && meal.date < today)
  )
  const upcoming = item.meals.some(
    (meal) => meal.status === "planned" && meal.date >= today
  )
  return missed.length && !upcoming ? { kind: "leftover", meals: missed } : null
}

/** Prep and quality words that don't make it a different thing to have. */
const SAME_THING =
  /\b(boneless|skinless|bone-in|skin-on|unsalted|salted|low-sodium|reduced-sodium|no-salt-added|low-fat|reduced-fat|fat-free|shredded|grated|chopped|minced|diced|sliced|cubed|peeled|extra-virgin|extra virgin|virgin|yellow)\b/g

/**
 * A food as the pantry matches it: "Boneless skinless chicken thighs" and
 * "chicken thigh" are the same; "cream cheese" and "cheese" are not.
 */
export function pantryKey(name: string) {
  const key = foodKey(name)
  const core = key.replace(SAME_THING, " ").replace(/\s+/g, " ").trim()
  return core || key
}

/** Whether something in the pantry is the food an ingredient calls for. */
export function sameFood(have: string, need: string) {
  return pantryKey(have) === pantryKey(need)
}
