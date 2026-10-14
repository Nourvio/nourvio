import { z } from "zod"

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
  } | null
  /** A note instead of a recipe ("leftovers", "eating out"). */
  note: string | null
  /** Null means the recipe's own servings. */
  servings: number | null
  status: PlanStatus
}

const servings = z.number().positive().max(100).nullable()

export const addPlanEntryInput = z
  .object({
    date: isoDate,
    meal: z.enum(MEALS),
    recipeId: z.uuid().optional(),
    note: z.string().trim().min(1).max(200).optional(),
    servings: servings.optional(),
  })
  .refine((input) => Boolean(input.recipeId) !== Boolean(input.note), {
    message: "Add a recipe or a note",
  })
export type AddPlanEntryInput = z.input<typeof addPlanEntryInput>

export const updatePlanEntryInput = z.object({
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
