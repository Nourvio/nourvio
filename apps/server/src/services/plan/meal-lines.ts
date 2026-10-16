import { pairingFactor, type ListLine } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { PlanEntry } from "../../database/entities/index.ts"
import { NOT_DELETED_FILTER } from "../../database/scope.ts"
import { toNumber } from "../recipes/recipes.ts"

// What a planned meal takes: its recipe's ingredient lines, and its
// side's, scaled to its servings. The list shops for them; cooking uses
// them from the pantry.

/** What it takes to work out a meal's lines: its recipes and their lines. */
const POPULATE = ["recipe.ingredients", "withRecipe.ingredients"] as const

/** Loads meals' recipes and lines, Recently deleted ones too. */
export async function loadMealLines(
  em: EntityManager,
  entries: readonly PlanEntry[]
) {
  await em.populate([...entries], POPULATE, {
    filters: { [NOT_DELETED_FILTER]: false },
  })
}

/** Whether a meal's recipe can be cooked: it has one, not in Recently deleted. */
export function hasRecipe(entry: PlanEntry) {
  const recipe = entry.recipe?.getEntity()
  return Boolean(recipe && !recipe.deletedAt)
}

/**
 * A planned meal's ingredient lines, scaled to its servings, and its side's,
 * scaled to match as on the recipe page. Its recipes are loaded.
 */
export function mealLines(entry: PlanEntry): ListLine[] {
  const recipe = entry.recipe!.getEntity()
  const servings = toNumber(recipe.servings)
  const planned = toNumber(entry.servings)
  const factor = planned && servings ? planned / servings : 1
  const lines: ListLine[] = recipe.ingredients
    .getItems()
    .sort((a, b) => a.position - b.position)
    .map((line) => ({
      text: line.rawText,
      factor,
      source: recipe.name,
      meal: entry.id,
    }))
  const side = entry.withRecipe?.getEntity()
  if (side && !side.deletedAt) {
    const sideFactor = pairingFactor(
      { servings },
      { servings: toNumber(side.servings) },
      factor
    )
    for (const line of side.ingredients
      .getItems()
      .sort((a, b) => a.position - b.position)) {
      lines.push({
        text: line.rawText,
        factor: sideFactor,
        source: side.name,
        meal: entry.id,
      })
    }
  }
  return lines
}
