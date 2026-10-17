import { formatQuantity } from "../ingredients/display.ts"
import { parseIngredient } from "../ingredients/parse.ts"
import { METRIC_UNIT_IDS, UNITS_BY_ID, type Unit } from "../units/units.ts"
import { bakingDensity } from "../units/weights.ts"
import { foodKey, shoppingName } from "./food.ts"

// Adding up what to buy: the same food across recipes in one line, volumes
// and weights converted as they're added, and each planned meal's share
// kept, so taking a meal off the plan takes its share off the list.

/** An amount on the list: a number and a unit (an id from UNITS), or none. */
export type Amount = { quantity: number | null; unit: string | null }

/** How much of a line is for one planned meal. */
export type MealShare = Amount & { meal: string }

export type ListLine = {
  /** An ingredient line as written, "1 ½ cups milk". */
  text: string
  /** How much it's scaled by: the planned servings over the recipe's. */
  factor: number
  /** Where it's from: a recipe's name. */
  source: string
  /** The planned meal it's for. */
  meal?: string
}

export type CombinedItem = Amount & {
  /** The food and how it's measured: same key, one line on the list. */
  key: string
  food: string
  name: string
  sources: string[]
  shares: MealShare[]
}

const round = (value: number) => Math.round(value * 1000) / 1000

const unitOf = (id: string | null) =>
  id ? (UNITS_BY_ID.get(id) ?? null) : null

/** Measured by volume or weight, so it converts. */
const converts = (unit: Unit | null): unit is Unit & { toBase: number } =>
  unit !== null && unit.toBase !== null

/**
 * A food's own units, by its key: a head of garlic is ten cloves, a stick
 * of butter half a cup. `back` goes back to the bigger unit when it comes
 * out whole: 20 cloves is 2 heads.
 */
const FOOD_UNITS: Record<
  string,
  Record<string, { quantity: number; unit: string; back?: boolean }>
> = {
  garlic: { head: { quantity: 10, unit: "clove", back: true } },
  butter: { stick: { quantity: 0.5, unit: "cup" } },
}

/** An amount in a food's own terms: heads of garlic as cloves. */
function inFoodUnits(food: string | undefined, amount: Amount): Amount {
  const as = food && amount.unit ? FOOD_UNITS[food]?.[amount.unit] : undefined
  if (!as) return amount
  return {
    quantity: amount.quantity === null ? null : amount.quantity * as.quantity,
    unit: as.unit,
  }
}

/** Back to a food's bigger unit when it comes out whole: 2 heads of garlic. */
function inWholeUnits(food: string | undefined, amount: Amount): Amount {
  if (!food || amount.quantity === null) return amount
  for (const [unit, as] of Object.entries(FOOD_UNITS[food] ?? {})) {
    if (!as.back || amount.unit !== as.unit) continue
    const whole = amount.quantity / as.quantity
    if (Number.isInteger(round(whole))) return { quantity: round(whole), unit }
  }
  return amount
}

/**
 * How an amount of a food adds up: what it's measured in, and how much in
 * that measure's base. Volumes are in ml and weights in g, except a
 * baking staple's, which are both in grams so a cup of flour and 100 g of
 * it add up; counts are in their own unit.
 */
function measureOf(food: string | undefined, amount: Amount) {
  if (amount.quantity === null) return null
  const unit = unitOf(amount.unit)
  if (!converts(unit)) {
    return { measure: `count:${amount.unit ?? "each"}`, base: amount.quantity }
  }
  const density = food ? bakingDensity(food) : null
  if (density !== null) {
    const grams = unit.kind === "volume" ? unit.toBase * density : unit.toBase
    return { measure: "mass", base: amount.quantity * grams }
  }
  return { measure: unit.kind, base: amount.quantity * unit.toBase }
}

/** How many of a measure's base one of a unit is, for a food. */
function baseOf(food: string | undefined, unit: Unit & { toBase: number }) {
  const density = food ? bakingDensity(food) : null
  return density !== null && unit.kind === "volume"
    ? unit.toBase * density
    : unit.toBase
}

type Group = {
  key: string
  food: string
  name: string
  /** What it's measured in (see measureOf), or "none" without an amount. */
  measure: string
  /** In the measure's base; in the unit (or each) for a count. */
  total: number | null
  unit: string | null
  /** The unit to show it in: the biggest of the first kind used. */
  showUnit: (Unit & { toBase: number }) | null
  sources: Set<string>
  /** Each meal's share, in the same measure as the total. */
  shares: Map<string, number | null>
}

/**
 * Adds up ingredient lines into what to buy. The same food is one line
 * across recipes, however it's named ("plain flour" and "all-purpose
 * flour"); volumes and weights are converted as they're added (a baking
 * staple's into each other: a cup of flour and 100 g of it), a food's own
 * units too (a head of garlic is ten cloves), and other counts stay in
 * their own unit (2 cans and 1 lb of tomatoes stay apart). A line without
 * an amount ("salt to taste") is listed once, without one, unless the food
 * has an amount elsewhere. Ranges buy the top: 3 for "2-3 cloves".
 */
export function combineLines(lines: readonly ListLine[]): CombinedItem[] {
  const groups = new Map<string, Group>()

  for (const line of lines) {
    const parsed = parseIngredient(line.text)
    const name = shoppingName(parsed.food ?? parsed.text)
    if (!name) continue
    const food = foodKey(name)
    const top = parsed.quantityMax ?? parsed.quantity
    const amount = inFoodUnits(food, {
      quantity: top === null ? null : top * line.factor,
      unit: parsed.unitId,
    })
    const found = measureOf(food, amount)
    const measure = found?.measure ?? "none"
    const key = `${food}|${measure}`
    const unit = unitOf(amount.unit)

    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        food,
        name,
        measure,
        total: found ? 0 : null,
        unit: converts(unit) ? null : amount.unit,
        showUnit: null,
        sources: new Set(),
        shares: new Map(),
      }
      groups.set(key, group)
    }
    group.sources.add(line.source)
    let added: number | null = null
    if (found && group.total !== null) {
      added = found.base
      group.total += added
      if (
        converts(unit) &&
        (!group.showUnit ||
          (unit.kind === group.showUnit.kind &&
            unit.toBase > group.showUnit.toBase))
      )
        group.showUnit = unit
    }
    if (line.meal) {
      const before = group.shares.get(line.meal)
      group.shares.set(
        line.meal,
        added === null ? (before ?? null) : (before ?? 0) + added
      )
    }
  }

  // A food with an amount somewhere doesn't also need an "as needed" line.
  for (const [key, group] of groups) {
    if (group.measure !== "none") continue
    const sibling = [...groups.values()].find(
      (other) => other !== group && other.food === group.food
    )
    if (!sibling) continue
    for (const source of group.sources) sibling.sources.add(source)
    for (const meal of group.shares.keys())
      if (!sibling.shares.has(meal)) sibling.shares.set(meal, 0)
    groups.delete(key)
  }

  return [...groups.values()].map((group) => {
    const show = (value: number | null): Amount => {
      if (value === null) return { quantity: null, unit: null }
      const unit = group.showUnit
      return inWholeUnits(group.food, {
        quantity: round(unit ? value / baseOf(group.food, unit) : value),
        unit: unit?.id ?? group.unit,
      })
    }
    const total = show(group.total)
    return {
      key: group.key,
      food: group.food,
      name: group.name,
      quantity: total.quantity,
      unit:
        total.quantity === null
          ? (group.showUnit?.id ?? group.unit)
          : total.unit,
      sources: [...group.sources],
      shares: [...group.shares].map(([meal, value]) => ({
        meal,
        ...show(value),
      })),
    }
  })
}

/**
 * One amount plus another, when they add up: the same unit, volumes and
 * weights (converted, in the bigger unit), and with the food, its own
 * units (a head of garlic is ten cloves) and a baking staple's volume and
 * weight (into the first one's unit). Null when they don't, so they stay
 * apart.
 */
export function addAmounts(a: Amount, b: Amount, food?: string): Amount | null {
  const x = inFoodUnits(food, a)
  const y = inFoodUnits(food, b)
  if (x.quantity === null || y.quantity === null) {
    return x.unit === y.unit
      ? inWholeUnits(food, { quantity: x.quantity ?? y.quantity, unit: x.unit })
      : null
  }
  if (x.unit === y.unit) {
    return inWholeUnits(food, {
      quantity: round(x.quantity + y.quantity),
      unit: x.unit,
    })
  }
  const mx = measureOf(food, x)
  const my = measureOf(food, y)
  const ux = unitOf(x.unit)
  const uy = unitOf(y.unit)
  if (!mx || !my || mx.measure !== my.measure) return null
  if (!converts(ux) || !converts(uy)) return null
  // The bigger of the two, unless one's a weight and one a volume: then
  // the one already there.
  const shown = ux.kind !== uy.kind || ux.toBase >= uy.toBase ? ux : uy
  return {
    quantity: round((mx.base + my.base) / baseOf(food, shown)),
    unit: shown.id,
  }
}

/**
 * What's left of one amount after taking another, in the first one's unit
 * (with the food, a food's own units and a baking staple's volume and
 * weight compare too). Null when they don't compare (or either has no
 * amount). Can go below zero.
 */
export function subtractAmounts(
  have: Amount,
  take: Amount,
  food?: string
): { quantity: number; unit: string | null } | null {
  const h = inFoodUnits(food, have)
  const t = inFoodUnits(food, take)
  if (h.quantity === null || t.quantity === null) return null
  if (h.unit === t.unit)
    return { quantity: round(h.quantity - t.quantity), unit: h.unit }
  const mh = measureOf(food, h)
  const mt = measureOf(food, t)
  const uh = unitOf(h.unit)
  if (!mh || !mt || mh.measure !== mt.measure || !converts(uh)) return null
  return {
    quantity: round((mh.base - mt.base) / baseOf(food, uh)),
    unit: h.unit,
  }
}

/** "1 ½ cups", "3", "2 cans", "500 g". Empty when there's no amount. */
export function formatAmount(quantity: number | null, unit: string | null) {
  if (quantity === null) return ""
  const found = unitOf(unit)
  const number = formatQuantity(quantity, {
    metric: unit ? METRIC_UNIT_IDS.has(unit) : false,
  })
  if (!found) return number
  // "2 lb" and "1 tbsp" read well; "2 c" doesn't, so cups are spelled out.
  const label =
    found.abbreviation && found.kind !== "count" && found.id !== "cup"
      ? found.abbreviation
      : quantity > 1
        ? found.pluralName
        : found.name
  return `${number} ${label}`
}

/**
 * An amount as typed: "2 lb" is a number and a unit, "half a bag" stays as
 * written. Empty is no amount.
 */
export function readAmount(
  text: string
): Amount & { amountText: string | null } {
  const typed = text.trim()
  if (!typed) return { quantity: null, unit: null, amountText: null }
  const parsed = parseIngredient(`${typed} x`)
  return parsed.quantity !== null && parsed.food === "x"
    ? {
        quantity: parsed.quantityMax ?? parsed.quantity,
        unit: parsed.unitId,
        amountText: null,
      }
    : { quantity: null, unit: null, amountText: typed }
}

/**
 * Something typed onto the list: "2 lb ground beef" is ground beef, 2 lb;
 * "paper towels" is just that.
 */
export function readItem(text: string) {
  const typed = text.trim()
  const parsed = parseIngredient(typed)
  const name = parsed.food?.trim()
  if (parsed.quantity === null || !name)
    return { name: typed, quantity: null, unit: null }
  return {
    name,
    quantity: parsed.quantityMax ?? parsed.quantity,
    unit: parsed.unitId,
  }
}
