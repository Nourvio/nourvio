import { pairingFactor, type ListLine } from "@mise/shared"

import type { Db } from "../db/client.ts"
import { getRecipe } from "./recipes.ts"

/**
 * A planned meal's ingredient lines, scaled to its servings: the recipe's,
 * and what it's made with (scaled to match, as on the recipe page).
 */
export async function mealLines(
  db: Db,
  householdId: string,
  entry: {
    id: string
    recipeId: string
    withRecipeId: string | null
    servings: number | null
  }
): Promise<ListLine[]> {
  const recipe = await getRecipe(db, householdId, entry.recipeId)
  const factor =
    entry.servings && recipe.servings ? entry.servings / recipe.servings : 1
  const lines: ListLine[] = recipe.ingredients.map((ingredient) => ({
    text: ingredient.text,
    factor,
    source: recipe.name,
    entryId: entry.id,
  }))
  if (entry.withRecipeId) {
    const paired = await getRecipe(db, householdId, entry.withRecipeId).catch(
      () => null
    )
    if (paired) {
      const pairedFactor = pairingFactor(recipe, paired, factor)
      for (const ingredient of paired.ingredients) {
        lines.push({
          text: ingredient.text,
          factor: pairedFactor,
          source: paired.name,
          entryId: entry.id,
        })
      }
    }
  }
  return lines
}
