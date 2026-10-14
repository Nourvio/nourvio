import { addDays, weekdayOf, type Meal, type RecipeSummary } from "@mise/shared"
import { and, eq, gte, isNotNull, lte } from "drizzle-orm"

import type { Db } from "../db/client.ts"
import { mealPlanEntries } from "../db/schema.ts"
import { listRecipes } from "./recipes.ts"

/** Don't suggest what was planned or made this many days around the week. */
const NO_REPEAT_DAYS = 14

export type Suggestion = {
  date: string
  meal: Meal
  recipe: Pick<
    RecipeSummary,
    "id" | "slug" | "name" | "thumbnailUrl" | "totalMinutes" | "servings"
  >
}

const MEAL_TAGS: Record<Meal, string[]> = {
  breakfast: ["breakfast", "brunch"],
  lunch: ["lunch", "salad", "sandwich", "soup"],
  dinner: ["dinner", "main", "main course", "main dish", "entree", "supper"],
  snack: ["snack", "appetizer", "dessert"],
}

const tagsOf = (recipe: RecipeSummary) =>
  recipe.tags.map((tag) => tag.toLowerCase())

/**
 * Which recipes suit a meal. Breakfast, lunch and snacks only take recipes
 * tagged for them; dinner takes anything that isn't clearly another meal.
 */
function fits(recipe: RecipeSummary, meal: Meal) {
  const tags = tagsOf(recipe)
  if (MEAL_TAGS[meal].some((tag) => tags.includes(tag))) return true
  if (meal !== "dinner") return false
  const other = [
    ...MEAL_TAGS.breakfast,
    ...MEAL_TAGS.snack,
    "drink",
    "cocktail",
  ]
  return !other.some((tag) => tags.includes(tag))
}

/** Higher is likelier: well rated, tagged for the meal, quick on weeknights. */
function weight(recipe: RecipeSummary, meal: Meal, date: string) {
  let score = 1
  if (recipe.rating)
    score += recipe.rating >= 4 ? 2 : recipe.rating <= 2 ? -0.75 : 0.5
  else if (!recipe.lastMadeAt) score += 0.5 // something new to try
  if (MEAL_TAGS[meal].some((tag) => tagsOf(recipe).includes(tag))) score += 1
  const weeknight = [1, 2, 3, 4].includes(weekdayOf(date))
  if (meal === "dinner" && weeknight && recipe.totalMinutes) {
    score += recipe.totalMinutes <= 45 ? 1 : recipe.totalMinutes > 75 ? -0.5 : 0
  }
  return Math.max(score, 0.1)
}

function pick<T>(
  items: T[],
  weightOf: (item: T) => number,
  random: () => number
) {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0)
  let roll = random() * total
  for (const item of items) {
    roll -= weightOf(item)
    if (roll <= 0) return item
  }
  return items.at(-1)
}

/**
 * A recipe and its versions ("Pancakes" and "Pancakes (dairy-free)") count as
 * one dish, so they aren't suggested in the same fortnight.
 */
const dish = (name: string) =>
  name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim()
    .toLowerCase()

/**
 * Suggests a recipe for each slot, by the rules above, without repeating a
 * dish across the slots or within two weeks of being planned or made.
 * Slots with nothing suitable are left out.
 */
export async function suggestMeals(
  db: Db,
  householdId: string,
  slots: { date: string; meal: Meal }[],
  options: { exclude?: string[]; random?: () => number } = {}
): Promise<Suggestion[]> {
  if (!slots.length) return []
  const random = options.random ?? Math.random
  const dates = slots.map((slot) => slot.date).sort()
  const from = addDays(dates[0]!, -NO_REPEAT_DAYS)
  const to = addDays(dates.at(-1)!, NO_REPEAT_DAYS)

  const recipes = await listRecipes(db, householdId)
  const nearby = await db
    .select({ recipeId: mealPlanEntries.recipeId })
    .from(mealPlanEntries)
    .where(
      and(
        eq(mealPlanEntries.householdId, householdId),
        isNotNull(mealPlanEntries.recipeId),
        gte(mealPlanEntries.date, from),
        lte(mealPlanEntries.date, to)
      )
    )
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]))
  const used = new Set<string>(
    [...(options.exclude ?? []), ...nearby.map((row) => row.recipeId!)]
      .map((id) => byId.get(id))
      .filter((recipe) => recipe !== undefined)
      .map((recipe) => dish(recipe.name))
  )
  const madeLately = new Date(Date.now() - NO_REPEAT_DAYS * 86_400_000)

  const suggestions: Suggestion[] = []
  for (const slot of slots) {
    const candidates = recipes.filter(
      (recipe) =>
        !used.has(dish(recipe.name)) &&
        fits(recipe, slot.meal) &&
        !(recipe.lastMadeAt && new Date(recipe.lastMadeAt) > madeLately)
    )
    const chosen = pick(
      candidates,
      (r) => weight(r, slot.meal, slot.date),
      random
    )
    if (!chosen) continue
    used.add(dish(chosen.name))
    suggestions.push({
      ...slot,
      recipe: {
        id: chosen.id,
        slug: chosen.slug,
        name: chosen.name,
        thumbnailUrl: chosen.thumbnailUrl,
        totalMinutes: chosen.totalMinutes,
        servings: chosen.servings,
      },
    })
  }
  return suggestions
}
