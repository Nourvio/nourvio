import { parseIngredient } from "../ingredients/parse.ts"
import { guessAisle } from "./aisles.ts"
import { amountRatio, type Amount } from "./amounts.ts"
import { foodKey, shoppingName } from "./food.ts"
import { priceNow, type StoreProduct } from "./products.ts"

// What things cost at the household's store: a pack's size as an amount,
// how many packs an amount takes, and what a recipe comes to from its
// lines' share of each product's price.

/** The units a store's size is written in, as Merran's unit ids. */
const SIZE_UNITS: Record<string, string | null> = {
  "fl oz": "fluid-ounce",
  floz: "fluid-ounce",
  oz: "ounce",
  lb: "pound",
  lbs: "pound",
  g: "gram",
  kg: "kilogram",
  ml: "milliliter",
  l: "liter",
  lt: "liter",
  gal: "gallon",
  qt: "quart",
  pt: "pint",
  ct: null,
  count: null,
  pk: null,
  pack: null,
  each: null,
  ea: null,
}

const SIZE =
  /(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|floz|oz|lbs?|kg|g|ml|lt|l|gal|qt|pt|ct|count|pk|pack|each|ea)\b/i

/**
 * What a pack holds, as an amount: "1 lb" is a pound, "12 ct" is 12, "6 ct
 * / 12 fl oz" is 6 (the first said). Null when the size doesn't say.
 */
export function sizeAmount(size: string | null | undefined): Amount | null {
  const found = size?.match(SIZE)
  if (!found) return null
  const word = found[2]!
    .toLowerCase()
    .replace(/\.\s*/g, " ")
    .replace(/\s+/g, " ")
  const unit = SIZE_UNITS[word] ?? SIZE_UNITS[word.replace(/\s/g, "")] ?? null
  return { quantity: Number(found[1]), unit }
}

/** Bought by the pack whatever's in it: a can of tomatoes is one can. */
const PACK_UNITS = new Set(["can", "jar", "package", "bunch", "head"])

/**
 * What one of something sold by weight usually weighs, in grams, by its
 * food key: a recipe's "1 whole chicken" against a price by the pound.
 */
const EACH_GRAMS: [RegExp, number][] = [
  [/\bwhole chicken\b/, 2000],
  [/\bchicken breast\b/, 225],
  [/\bchicken thigh\b/, 115],
  [/\bsweet potato\b/, 250],
  [/\bpotato\b/, 225],
  [/\bonion\b/, 225],
  [/\bbell pepper\b/, 170],
  [/\bcarrot\b/, 70],
  [/\btomato\b/, 150],
  [/\bzucchini\b/, 200],
  [/\bcucumber\b/, 300],
  [/\bavocado\b/, 170],
  [/\bapple\b/, 180],
  [/\bbanana\b/, 120],
  [/\blemon\b/, 100],
  [/\blime\b/, 70],
]

/**
 * How many packs of a product an amount of a food takes, as a fraction:
 * 2 cups of flour are 0.53 of a 5 lb bag, a can of tomatoes one can, 2
 * onions 0.33 of a 3 lb bag (going by what an onion weighs). Null when they
 * don't compare.
 */
export function packsFor(
  food: string,
  need: Amount,
  size: string | null | undefined
): number | null {
  if (need.quantity === null || need.quantity <= 0) return null
  const pack = sizeAmount(size)
  const ratio = pack ? amountRatio(need, pack, food) : null
  if (ratio !== null) return ratio
  if (need.unit && PACK_UNITS.has(need.unit)) return need.quantity
  // So many of something sold by weight: what they usually weigh.
  const each = EACH_GRAMS.find(([pattern]) => pattern.test(food))?.[1]
  if (pack && each && need.unit === null) {
    return amountRatio({ quantity: need.quantity * each, unit: "gram" }, pack)
  }
  return null
}

/** More packs than this for one line means the product's the wrong one. */
const MOST_PACKS = 20

/** A recipe's cost from what its lines take of each product, in cents. */
export type RecipeCost = {
  total: number
  /** Lines with an amount of something bought. */
  counted: number
  /** Of those, the ones with a price. */
  priced: number
  /**
   * A line of meat or fish without a price: most of what the recipe costs,
   * so the rest isn't near it.
   */
  missingMain: boolean
  currency: string | null
}

/**
 * What a recipe costs at the household's store: each line's share of its
 * product's price today (a sale included), for the lines with an amount of
 * something bought (not salt to taste, or what's always at home).
 */
export function recipeCost(
  lines: readonly string[],
  productOf: (food: string) => StoreProduct | undefined,
  {
    today,
    isOnHand = () => false,
  }: { today: string; isOnHand?: (name: string) => boolean }
): RecipeCost {
  const cost: RecipeCost = {
    total: 0,
    counted: 0,
    priced: 0,
    missingMain: false,
    currency: null,
  }
  for (const line of lines) {
    const parsed = parseIngredient(line)
    const name = shoppingName(parsed.food ?? parsed.text)
    const quantity = parsed.quantityMax ?? parsed.quantity
    if (!name || quantity === null || isOnHand(name)) continue
    cost.counted++
    const food = foodKey(name)
    const product = productOf(food)
    const price = product ? priceNow(product, today).price : null
    const packs = product
      ? packsFor(food, { quantity, unit: parsed.unitId }, product.size)
      : null
    // Twenty packs for one line is the wrong product, not a big recipe.
    if (price === null || packs === null || packs > MOST_PACKS) {
      if (guessAisle(name) === "meat-seafood") cost.missingMain = true
      continue
    }
    cost.total += price * packs
    cost.priced++
    cost.currency ??= product?.currency ?? null
  }
  cost.total = Math.round(cost.total)
  return cost
}

/**
 * A cost worth showing, near what the recipe costs: most of its lines have
 * a price (three in five), its meat and fish among them.
 */
export function costShown(cost: RecipeCost | null | undefined) {
  return cost &&
    cost.counted > 0 &&
    !cost.missingMain &&
    cost.priced / cost.counted >= 0.6
    ? cost
    : null
}

/** A planned meal's cost: the recipe's, for the servings planned. */
export function costFor(
  total: number,
  servings: number | null,
  recipeServings: number | null
) {
  return servings && recipeServings
    ? (total * servings) / recipeServings
    : total
}
