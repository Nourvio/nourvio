import type { PlanEntry } from "@mise/shared"

/** How much of the recipe a planned meal makes: 2 for 8 servings of a 4-serving recipe. */
export function entryScale(entry: PlanEntry) {
  const { recipe } = entry
  return recipe?.servings && entry.servings
    ? entry.servings / recipe.servings
    : 1
}

/**
 * The cook view for a planned meal: at its scale, with what it goes with,
 * and finishing marks this meal cooked.
 */
export function cookLink(entry: PlanEntry) {
  const params = new URLSearchParams()
  const scale = entryScale(entry)
  if (scale !== 1) params.set("scale", String(scale))
  if (entry.with) params.set("with", entry.with.slug)
  params.set("entry", entry.id)
  return `/recipes/${entry.recipe!.slug}/cook?${params}`
}
