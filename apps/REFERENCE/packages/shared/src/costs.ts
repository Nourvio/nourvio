import type { Need, ProductSize, ShopId } from "./shopping.ts"

/**
 * What a recipe costs, from the products remembered at the household's
 * stores: what it uses of each package, at today's price.
 */
export type RecipeCost = {
  /** For the recipe as written, all its servings. */
  total: number
  /** Null when the recipe doesn't say how many it serves. */
  perServing: number | null
  /** Ingredients with a price, of those that count (always-on-hand ones don't). */
  priced: number
  counted: number
}

/** One ingredient's share of the cost, for the breakdown on the recipe. */
export type RecipeCostLine = {
  text: string
  /** The product it's priced from, or null when there's none yet. */
  product: string | null
  shop: ShopId | null
  cost: number | null
  /** False when the amount and the package couldn't be compared exactly. */
  sure: boolean
  /** Left out: salt, pepper and the like are always at home. */
  onHand: boolean
}

export type RecipeCostDetail = RecipeCost & { lines: RecipeCostLine[] }

/** Recipe id → its cost. */
export type RecipeCosts = Record<string, RecipeCost>

/** Worth showing once most of the recipe is priced; else null. */
export function costShown(cost: RecipeCost | null | undefined) {
  return cost && cost.counted > 0 && cost.priced / cost.counted >= 0.6
    ? cost
    : null
}

/** A planned meal's cost: the recipe's, scaled to the servings planned. */
export function costFor(
  cost: RecipeCost | null | undefined,
  servings: number | null,
  recipeServings: number | null
) {
  if (!cost) return null
  if (servings && recipeServings)
    return (cost.total * servings) / recipeServings
  return cost.total
}

/**
 * How much of a package a recipe uses: 2 tbsp of a 500 ml bottle is 0.06,
 * 3 onions sold by the each is 3. Null when they can't be compared.
 */
export function shareOf(
  need: Need,
  size: ProductSize | null
): { share: number; sure: boolean } | null {
  if (need.containers && need.count) {
    if (size?.count) return { share: need.count / size.count, sure: true }
    if (size?.kind === "count") {
      return { share: need.count / size.amount, sure: true }
    }
    // "2 cans" and a can's weight: one of theirs is one of ours.
    return { share: need.count, sure: Boolean(size) }
  }
  if (!size) return need.count ? { share: need.count, sure: false } : null
  if (size.kind === "count") {
    if (need.count) return { share: need.count / size.amount, sure: true }
    if (need.grams && need.eachGrams) {
      return { share: need.grams / need.eachGrams / size.amount, sure: true }
    }
    return null
  }
  if (size.kind === "weight") {
    if (need.grams) return { share: need.grams / size.amount, sure: true }
    if (need.ml) return { share: need.ml / size.amount, sure: false }
    return null
  }
  if (need.ml) return { share: need.ml / size.amount, sure: true }
  if (need.grams) return { share: need.grams / size.amount, sure: false }
  return null
}
