import { z } from "zod"

import type { Nutrition } from "./recipes.ts"

/** What a planned recipe is made with: "with Peanut Sauce". */
export type PlanPairing = {
  id: string
  slug: string
  name: string
  servings: number | null
  nutrition: PlanNutrition | null
}

/** The numbers the plan adds up, per serving. */
export type PlanNutrition = Pick<
  Nutrition,
  "calories" | "protein" | "carbohydrates" | "fat"
>

/** Meals a day can have. Every one is optional; a household picks which to show. */
export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const
export type Meal = (typeof MEALS)[number]

export const MEAL_NAMES: Record<Meal, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
}

export const DEFAULT_MEALS: Meal[] = ["breakfast", "lunch", "dinner"]

export const PLAN_STATUSES = ["planned", "cooked", "skipped"] as const
export type PlanStatus = (typeof PLAN_STATUSES)[number]

/** A calendar date, "2026-10-14", in the household's own time. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-14")

export type PlanEntry = {
  id: string
  date: string
  meal: Meal
  /** Order within the meal, for a dinner with a main and a side. */
  position: number
  recipe: {
    id: string
    slug: string
    name: string
    thumbnailUrl: string | null
    totalMinutes: number | null
    servings: number | null
    nutrition: PlanNutrition | null
  } | null
  /** What it's made with, from what the recipe goes with ("with Peanut Sauce"). */
  with: PlanPairing | null
  /** A note instead of a recipe ("leftovers", "eating out"). */
  note: string | null
  /** Null means the recipe's own servings. */
  servings: number | null
  status: PlanStatus
  /** Its ingredients have been added to the shopping list. */
  listed: boolean
  /** What cooking it took out of the pantry; put back if it's un-cooked. */
  pantryUsed: string[]
}

const servings = z.number().positive().max(100).nullable()

export const addPlanEntryInput = z
  .object({
    date: isoDate,
    meal: z.enum(MEALS),
    recipeId: z.uuid().optional(),
    /** What it's made with: a sauce or side it goes with. */
    withRecipeId: z.uuid().nullable().optional(),
    note: z.string().trim().min(1).max(200).optional(),
    servings: servings.optional(),
  })
  .refine((input) => Boolean(input.recipeId) !== Boolean(input.note), {
    message: "Add a recipe or a note",
  })
export type AddPlanEntryInput = z.input<typeof addPlanEntryInput>

export const updatePlanEntryInput = z.object({
  /** Swap in another recipe ("suggest something else"). */
  recipeId: z.uuid().optional(),
  /** What it's made with; null for nothing. */
  withRecipeId: z.uuid().nullable().optional(),
  date: isoDate.optional(),
  meal: z.enum(MEALS).optional(),
  servings: servings.optional(),
  status: z.enum(PLAN_STATUSES).optional(),
  note: z.string().trim().min(1).max(200).optional(),
})
export type UpdatePlanEntryInput = z.infer<typeof updatePlanEntryInput>

/** Dates as UTC midnights, so day arithmetic ignores daylight saving. */
function parse(date: string) {
  const [y, m, d] = date.split("-").map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

function format(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(date: string, days: number) {
  return format(parse(date) + days * 86_400_000)
}

export function daysBetween(from: string, to: string) {
  return Math.round((parse(to) - parse(from)) / 86_400_000)
}

/** 0 is Sunday, as in Date.getDay(). */
export function weekdayOf(date: string) {
  return new Date(parse(date)).getUTCDay()
}

/** The first day of the week holding `date`, with weeks starting on `weekStart`. */
export function startOfWeek(date: string, weekStart: 0 | 1) {
  const back = (weekdayOf(date) - weekStart + 7) % 7
  return addDays(date, -back)
}

/** A local Date as "YYYY-MM-DD" (not UTC, which can be tomorrow already). */
export function toIsoDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export const suggestMealsInput = z.object({
  /** The empty meals to fill. */
  slots: z
    .array(z.object({ date: isoDate, meal: z.enum(MEALS) }))
    .min(1)
    .max(40),
  /** Recipes not to suggest, like the ones being replaced. */
  exclude: z.array(z.uuid()).max(100).optional(),
})
export type SuggestMealsInput = z.infer<typeof suggestMealsInput>

export type MealSuggestion = {
  date: string
  meal: Meal
  recipe: Omit<NonNullable<PlanEntry["recipe"]>, "nutrition">
  /** A sauce or side it goes with, picked to go with it. */
  with: { id: string; slug: string; name: string } | null
  /** Pantry food it uses up that needs using soon. */
  uses: string[]
}

export const addPlanEntriesInput = z.object({
  entries: z
    .array(
      z.object({
        date: isoDate,
        meal: z.enum(MEALS),
        recipeId: z.uuid().optional(),
        withRecipeId: z.uuid().nullable().optional(),
        note: z.string().trim().min(1).max(200).optional(),
        servings: z.number().positive().max(100).nullable().optional(),
      })
    )
    .min(1)
    .max(50),
})
export type AddPlanEntriesInput = z.infer<typeof addPlanEntriesInput>

export type PlanTotals = {
  calories: number
  protein: number
  carbohydrates: number
  fat: number
  /** Meals with nutrition, out of `meals`. */
  counted: number
  /** Recipe meals that weren't skipped. */
  meals: number
}

/**
 * What one person eats from these meals: one serving of each recipe that
 * wasn't skipped. Notes ("Eating out") and meals without nutrition aren't
 * counted.
 */
export function planTotals(entries: PlanEntry[]): PlanTotals {
  const meals = entries.filter(
    (entry) => entry.recipe && entry.status !== "skipped"
  )
  const totals = { calories: 0, protein: 0, carbohydrates: 0, fat: 0 }
  let counted = 0
  for (const entry of meals) {
    const nutrition = entry.recipe!.nutrition
    if (nutrition?.calories == null) continue
    counted++
    // A pairing is scaled to the same servings, so a serving of each.
    const paired =
      entry.with?.nutrition && entry.recipe!.servings && entry.with.servings
        ? entry.with.nutrition
        : null
    for (const part of paired ? [nutrition, paired] : [nutrition]) {
      totals.calories += part.calories ?? 0
      totals.protein += part.protein ?? 0
      totals.carbohydrates += part.carbohydrates ?? 0
      totals.fat += part.fat ?? 0
    }
  }
  return { ...totals, counted, meals: meals.length }
}
