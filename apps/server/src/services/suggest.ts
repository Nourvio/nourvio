import {
  addDays,
  pantryKey,
  parseIngredient,
  toIsoDate,
  weekdayOf,
  whyUseSoon,
  type Meal,
  type RecipeSummary,
  type UseSoonReason,
} from "@mise/shared"
import { and, eq, gte, isNotNull, lte, ne } from "drizzle-orm"

import type { Db } from "../db/client.ts"
import {
  mealPlanEntries,
  recipeIngredients,
  recipes as recipesTable,
} from "../db/schema.ts"
import { listPantry } from "./pantry.ts"
import { listRecipes } from "./recipes.ts"

/** Don't suggest what was planned (and not skipped) or made this many days around the week. */
const NO_REPEAT_DAYS = 14

export type Suggestion = {
  date: string
  meal: Meal
  recipe: Pick<
    RecipeSummary,
    "id" | "slug" | "name" | "thumbnailUrl" | "totalMinutes" | "servings"
  >
  /** Pantry food it uses up that needs using soon. */
  uses: string[]
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
 * dish across the slots or within two weeks of being planned or made. Food
 * in the pantry that needs using soon gets a recipe first, as early in the
 * week as one fits. Slots with nothing suitable are left out.
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
        // A skipped meal wasn't eaten, so it can come round again.
        ne(mealPlanEntries.status, "skipped"),
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
  const usesOf = await useSoonFoods(db, householdId)

  const candidatesFor = (slot: { date: string; meal: Meal }) =>
    recipes.filter(
      (recipe) =>
        !used.has(dish(recipe.name)) &&
        fits(recipe, slot.meal) &&
        !(recipe.lastMadeAt && new Date(recipe.lastMadeAt) > madeLately)
    )
  const chosen = new Map<number, RecipeSummary>()
  const choose = (index: number, recipe: RecipeSummary) => {
    chosen.set(index, recipe)
    used.add(dish(recipe.name))
  }

  // First, a recipe for each food that needs using, as early as it fits.
  const order = slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => a.slot.date.localeCompare(b.slot.date))
  const covered = new Set<string>()
  for (const food of usesOf.foods) {
    if (covered.has(food)) continue
    for (const { slot, index } of order) {
      if (chosen.has(index)) continue
      const using = candidatesFor(slot).filter((recipe) =>
        usesOf.recipe(recipe.id).includes(food)
      )
      const recipe = pick(using, (r) => weight(r, slot.meal, slot.date), random)
      if (!recipe) continue
      choose(index, recipe)
      for (const name of usesOf.recipe(recipe.id)) covered.add(name)
      break
    }
  }

  // Then the rest, by the usual rules.
  for (const [index, slot] of slots.entries()) {
    if (chosen.has(index)) continue
    const recipe = pick(
      candidatesFor(slot),
      (r) => weight(r, slot.meal, slot.date) + usesOf.recipe(r.id).length,
      random
    )
    if (recipe) choose(index, recipe)
  }

  return slots.flatMap((slot, index) => {
    const recipe = chosen.get(index)
    if (!recipe) return []
    return [
      {
        ...slot,
        recipe: {
          id: recipe.id,
          slug: recipe.slug,
          name: recipe.name,
          thumbnailUrl: recipe.thumbnailUrl,
          totalMinutes: recipe.totalMinutes,
          servings: recipe.servings,
        },
        uses: usesOf.recipe(recipe.id),
      },
    ]
  })
}

/**
 * Pantry food that needs using soon, most urgent first, and which of it each
 * recipe would use.
 */
async function useSoonFoods(db: Db, householdId: string) {
  const today = toIsoDate(new Date())
  const soon = (await listPantry(db, householdId))
    .map((item) => ({ item, why: whyUseSoon(item, today) }))
    .filter((row) => row.why !== null)
    .sort((a, b) => urgency(a.why!) - urgency(b.why!))
  const foods = soon.map((row) => row.item.name)
  const byKey = new Map(foods.map((name) => [pantryKey(name), name]))
  const uses = new Map<string, string[]>()
  if (byKey.size) {
    const lines = await db
      .select({
        recipeId: recipeIngredients.recipeId,
        food: recipeIngredients.food,
        rawText: recipeIngredients.rawText,
      })
      .from(recipeIngredients)
      .innerJoin(recipesTable, eq(recipeIngredients.recipeId, recipesTable.id))
      .where(eq(recipesTable.householdId, householdId))
    for (const line of lines) {
      const food = line.food ?? parseIngredient(line.rawText).food
      const name = food ? byKey.get(pantryKey(food)) : undefined
      if (!name) continue
      const list = uses.get(line.recipeId) ?? []
      if (!list.includes(name)) uses.set(line.recipeId, [...list, name])
    }
  }
  return { foods, recipe: (id: string) => uses.get(id) ?? [] }
}

/** Past use-by dates first, then the closest, then leftovers from skipped meals. */
function urgency(why: UseSoonReason) {
  return why.kind === "leftover"
    ? Number.MAX_SAFE_INTEGER
    : Date.parse(why.date)
}
