import {
  addAmounts,
  combineLines,
  daysBetween,
  DEFAULT_ON_HAND,
  foodKey,
  isDay,
  onHandTest,
  pairingFactor,
  subtractAmounts,
  type ListLine,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import {
  Household,
  PlanEntry,
  ShoppingItem,
  WeeklyItem,
} from "../../database/entities/index.ts"
import { NOT_DELETED_FILTER } from "../../database/scope.ts"
import { inHouseholdTransaction, toNumber } from "../recipes/recipes.ts"
import { aislesOf } from "./aisles.ts"
import { mainList } from "./list.ts"

// Planned meals onto the list, added up, and off again: the list follows
// the plan. Each item keeps how much of it is each meal's, so taking a
// meal off the plan, or changing it, takes its share back off.

/** The most days added from the plan at once. */
const MAX_DAYS = 62

/** What it takes to work out a meal's lines: its recipes and their lines. */
const POPULATE = ["recipe.ingredients", "withRecipe.ingredients"] as const

/**
 * What's shopped for: a meal with a recipe, unless it's skipped. A cooked
 * one was bought for. Recipes in Recently deleted aren't.
 */
const shopped = (entry: PlanEntry) => {
  const recipe = entry.recipe?.getEntity()
  return Boolean(recipe && !recipe.deletedAt) && entry.status !== "skipped"
}

/**
 * A planned meal's ingredient lines, scaled to its servings, and its side's,
 * scaled to match as on the recipe page. Its recipes are loaded.
 */
function mealLines(entry: PlanEntry): ListLine[] {
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

/** What the household always has, which lists made from the plan leave off. */
async function onHandOf(em: EntityManager, householdId: string) {
  const household = await em.findOneOrFail(Household, { id: householdId })
  return onHandTest(household.settings?.alwaysOnHand ?? DEFAULT_ON_HAND)
}

/**
 * Planned meals' ingredients onto the list: added up across meals, merged
 * into what's waiting there already, leaving off what's always on hand.
 * The meals are marked listed.
 */
export async function listMeals(
  em: EntityManager,
  householdId: string,
  entries: readonly PlanEntry[]
) {
  await em.populate([...entries], POPULATE, {
    filters: { [NOT_DELETED_FILTER]: false },
  })
  const meals = entries.filter(shopped)
  const isOnHand = await onHandOf(em, householdId)
  const onHand = new Set<string>()
  const combined = combineLines(meals.flatMap(mealLines)).filter((item) => {
    if (!isOnHand(item.name)) return true
    onHand.add(item.name.toLowerCase())
    return false
  })

  let added = 0
  let merged = 0
  if (combined.length > 0) {
    const list = await mainList(em, householdId)
    const waiting = await em.find(ShoppingItem, { checked: false })
    const aisles = await aislesOf(em, householdId, combined)
    for (const [index, item] of combined.entries()) {
      // The line of the same food it adds up with: garlic cloves go with
      // cloves, not with a head of garlic.
      let match: ShoppingItem | undefined
      let sum: ReturnType<typeof addAmounts> = null
      for (const row of waiting) {
        if (row.foodKey !== item.food || row.amountText) continue
        sum = addAmounts(
          { quantity: toNumber(row.quantity), unit: row.unit ?? null },
          item
        )
        if (sum) {
          match = row
          break
        }
      }
      if (match && sum) {
        em.assign(match, {
          quantity: sum.quantity,
          unit: sum.unit,
          forMeals: [...(match.forMeals ?? []), ...item.shares],
        })
        merged++
      } else {
        waiting.push(
          em.create(ShoppingItem, {
            household: householdId,
            list,
            foodKey: item.food,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            aisle: aisles[index] ?? null,
            source: "plan",
            forMeals: item.shares,
          })
        )
        added++
      }
    }
  }
  const now = new Date()
  for (const entry of meals) entry.listedAt = now
  await em.flush()
  return { meals: meals.length, added, merged, onHand: [...onHand] }
}

/**
 * Takes meals' shares back off the list, and marks them not listed. What's
 * checked off is bought, so it stays. An item only there for those meals
 * goes; one with more on it keeps the rest.
 */
async function unlistMeals(em: EntityManager, entries: readonly PlanEntry[]) {
  const ids = new Set(entries.map((entry) => entry.id))
  for (const entry of entries) entry.listedAt = null
  if (ids.size === 0) return
  const items = await em.find(ShoppingItem, { checked: false })
  for (const item of items) {
    const shares = item.forMeals ?? []
    const leaving = shares.filter((share) => ids.has(share.meal))
    if (leaving.length === 0) continue
    let amount = { quantity: toNumber(item.quantity), unit: item.unit ?? null }
    let used = false
    for (const share of leaving) {
      const rest = subtractAmounts(amount, share)
      if (rest) amount = rest
      else if (share.quantity !== null) used = true
    }
    const staying = shares.filter((share) => !ids.has(share.meal))
    const nothingLeft =
      (amount.quantity !== null && amount.quantity <= 0.001 && !used) ||
      (item.source === "plan" && staying.length === 0)
    if (nothingLeft) {
      em.remove(item)
      continue
    }
    em.assign(item, {
      quantity: amount.quantity,
      unit: amount.unit,
      forMeals: staying.length > 0 ? staying : null,
    })
  }
}

/**
 * What a meal on the list is shopped for: its recipe, side and servings,
 * unless it's skipped or a note. Null when it isn't on the list.
 */
export function shoppingFor(entry: PlanEntry) {
  if (!entry.listedAt || !entry.recipe || entry.status === "skipped")
    return null
  return [entry.recipe.id, entry.withRecipe?.id, toNumber(entry.servings)].join(
    " "
  )
}

/**
 * The list follows the plan. Each meal says what it was shopped for before
 * a change and after it (`shoppingFor`, or null): one that's not shopped
 * for any more (taken off, skipped, a note now) has its share taken off
 * the list; one shopped for differently (another recipe, side or servings)
 * has its old share taken off and its new one put on. Moving a meal, or
 * cooking it, changes nothing. Call it once the changes are saved.
 */
export async function followPlan(
  em: EntityManager,
  householdId: string,
  changes: readonly {
    entry: PlanEntry
    was: string | null
    now: string | null
  }[]
) {
  const changed = changes.filter((change) => change.was !== change.now)
  if (changed.length === 0) return
  await unlistMeals(
    em,
    changed
      .filter((change) => change.was !== null)
      .map((change) => change.entry)
  )
  const on = changed
    .filter((change) => change.now !== null)
    .map((change) => change.entry)
  if (on.length > 0) await listMeals(em, householdId, on)
  await em.flush()
}

/** Checks a range of days to add from the plan. */
function checkRange(from: string, to: string) {
  if (!isDay(from) || !isDay(to) || to < from) {
    throw new AppError(
      "invalid",
      "invalid_range",
      "Give a first and last day, in order."
    )
  }
  if (daysBetween(from, to) >= MAX_DAYS) {
    throw new AppError(
      "invalid",
      "range_too_long",
      `Add ${MAX_DAYS} days at most at once.`
    )
  }
}

/** Planned meals from one day to another that aren't on the list yet. */
async function waitingMeals(em: EntityManager, from: string, to: string) {
  checkRange(from, to)
  const entries = await em.find(
    PlanEntry,
    {
      date: { $gte: from, $lte: to },
      status: "planned",
      recipe: { $ne: null },
    },
    {
      populate: ["recipe"],
      filters: { [NOT_DELETED_FILTER]: false },
      orderBy: { date: "asc", position: "asc" },
    }
  )
  return entries.filter((entry) => !entry.recipe?.getEntity().deletedAt)
}

/** What adding from the plan would add: the meals not on the list yet. */
export async function previewFromPlan(
  em: EntityManager,
  { from, to }: { from: string; to: string }
) {
  const entries = await waitingMeals(em, from, to)
  return {
    meals: entries
      .filter((entry) => !entry.listedAt)
      .map((entry) => ({
        id: entry.id,
        date: entry.date,
        anyDay: entry.anyDay,
        meal: entry.meal,
        name: entry.recipe!.getEntity().name,
      })),
    listed: entries.filter((entry) => entry.listedAt).length,
  }
}

/**
 * The plan's meals from one day to another onto the list, those not on it
 * yet, and the every-week items not on it. All or none.
 */
export async function addFromPlan(
  em: EntityManager,
  householdId: string,
  { from, to }: { from: string; to: string }
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const entries = (await waitingMeals(tx, from, to)).filter(
      (entry) => !entry.listedAt
    )
    const listed = await listMeals(tx, householdId, entries)
    const everyWeek = await addEveryWeek(tx, householdId)
    return { ...listed, everyWeek }
  })
}

/** The every-week items not on the list already. Says how many went on. */
export async function addEveryWeek(em: EntityManager, householdId: string) {
  const weekly = await em.find(WeeklyItem, {}, { orderBy: { position: "asc" } })
  if (weekly.length === 0) return 0
  const waiting = await em.find(ShoppingItem, {
    checked: false,
    source: "every-week",
  })
  const have = new Set(waiting.map((item) => item.foodKey))
  const missing = weekly.filter((item) => !have.has(foodKey(item.name)))
  if (missing.length === 0) return 0
  const list = await mainList(em, householdId)
  const guessed = await aislesOf(em, householdId, missing)
  for (const [index, item] of missing.entries()) {
    em.create(ShoppingItem, {
      household: householdId,
      list,
      foodKey: foodKey(item.name),
      name: item.name,
      amountText: item.amountText ?? null,
      aisle: item.aisle ?? guessed[index] ?? null,
      source: "every-week",
    })
  }
  await em.flush()
  return missing.length
}
