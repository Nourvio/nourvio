import { formatQuantity } from "../ingredients/display.ts"
import { parseIngredient } from "../ingredients/parse.ts"
import { METRIC_UNIT_IDS, UNITS_BY_ID, type Unit } from "../units/units.ts"
import { foodKey, HOW_MUCH } from "./food.ts"

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

type Group = {
  key: string
  food: string
  name: string
  kind: "volume" | "weight" | "count" | "none"
  /** In ml or g for a volume or weight; in the unit (or each) otherwise. */
  total: number | null
  unit: string | null
  /** The unit to show a volume or weight in: the biggest one used. */
  showUnit: Unit | null
  sources: Set<string>
  /** Each meal's share, in the same measure as the total. */
  shares: Map<string, number | null>
}

/**
 * Adds up ingredient lines into what to buy. The same food is one line
 * across recipes; volumes and weights are converted as they're added, and
 * counts stay in their own unit (2 cans and 1 lb of tomatoes stay apart).
 * A line without an amount ("salt to taste") is listed once, without one,
 * unless the food has an amount elsewhere. Ranges buy the top: 3 for "2-3
 * cloves".
 */
export function combineLines(lines: readonly ListLine[]): CombinedItem[] {
  const groups = new Map<string, Group>()

  for (const line of lines) {
    const parsed = parseIngredient(line.text)
    const name = (parsed.food ?? parsed.text).replace(HOW_MUCH, "").trim()
    if (!name) continue
    const food = foodKey(name)
    const unit = unitOf(parsed.unitId)
    const amount = parsed.quantityMax ?? parsed.quantity
    const kind: Group["kind"] =
      amount === null
        ? "none"
        : unit?.kind === "volume" || unit?.kind === "weight"
          ? unit.kind
          : "count"
    const key =
      kind === "count" ? `${food}|${unit?.id ?? "each"}` : `${food}|${kind}`

    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        food,
        name,
        kind,
        total: kind === "none" ? null : 0,
        unit: kind === "count" ? (unit?.id ?? null) : null,
        showUnit: null,
        sources: new Set(),
        shares: new Map(),
      }
      groups.set(key, group)
    }
    group.sources.add(line.source)
    let added: number | null = null
    if (amount !== null && group.total !== null) {
      const scaled = amount * line.factor
      added = converts(unit) ? scaled * unit.toBase : scaled
      group.total += added
      if (
        converts(unit) &&
        (!group.showUnit || unit.toBase > group.showUnit.toBase!)
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
    if (group.kind !== "none") continue
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
    const show = (value: number | null) =>
      value === null
        ? null
        : round(group.showUnit ? value / group.showUnit.toBase! : value)
    const unit = group.showUnit?.id ?? group.unit
    return {
      key: group.key,
      food: group.food,
      name: group.name,
      quantity: show(group.total),
      unit,
      sources: [...group.sources],
      shares: [...group.shares].map(([meal, value]) => ({
        meal,
        quantity: show(value),
        unit: value === null ? null : unit,
      })),
    }
  })
}

/**
 * One amount plus another, when they add up: the same unit, or volumes and
 * weights (converted, in the bigger unit). Null when they don't, so they
 * stay apart.
 */
export function addAmounts(a: Amount, b: Amount): Amount | null {
  if (a.quantity === null || b.quantity === null) {
    return a.unit === b.unit
      ? { quantity: a.quantity ?? b.quantity, unit: a.unit }
      : null
  }
  if (a.unit === b.unit)
    return { quantity: round(a.quantity + b.quantity), unit: a.unit }
  const ua = unitOf(a.unit)
  const ub = unitOf(b.unit)
  if (converts(ua) && converts(ub) && ua.kind === ub.kind) {
    const bigger = ua.toBase >= ub.toBase ? ua : ub
    return {
      quantity: round(
        (a.quantity * ua.toBase + b.quantity * ub.toBase) / bigger.toBase
      ),
      unit: bigger.id,
    }
  }
  return null
}

/**
 * What's left of one amount after taking another, in the first one's unit.
 * Null when they don't compare (or either has no amount). Can go below
 * zero.
 */
export function subtractAmounts(
  have: Amount,
  take: Amount
): { quantity: number; unit: string | null } | null {
  if (have.quantity === null || take.quantity === null) return null
  if (have.unit === take.unit)
    return { quantity: round(have.quantity - take.quantity), unit: have.unit }
  const uh = unitOf(have.unit)
  const ut = unitOf(take.unit)
  if (converts(uh) && converts(ut) && uh.kind === ut.kind) {
    return {
      quantity: round(
        (have.quantity * uh.toBase - take.quantity * ut.toBase) / uh.toBase
      ),
      unit: have.unit,
    }
  }
  return null
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
