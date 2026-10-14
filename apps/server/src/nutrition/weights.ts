import { bakingDensity, STICK_OF_BUTTER_GRAMS } from "@mise/shared"
import { eq, inArray } from "drizzle-orm"

import type { Db } from "../db/client.ts"
import { fdcFoods, foodMatches, type FdcPortion } from "../db/schema.ts"
import { density, readAmount, type Amount } from "./grams.ts"

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

/**
 * Grams for one of a line's unit, for showing it in grams: weights convert
 * directly, a can uses its size, a stick of butter is 113 g, and volumes use
 * a baking staple's weight, else the USDA food's portions, else what one was
 * found to weigh before. Null for counts ("2 eggs") and anything unknown.
 */
export function unitGrams(
  amount: Amount,
  portions: FdcPortion[],
  known: Record<string, number>
): number | null {
  const { unit, written } = amount
  if (!unit || written === null || written <= 0) return null
  // What the recipe says it weighs, spread over the amount so it scales.
  if (amount.stated) return amount.stated / written
  const extra =
    amount.plus && amount.plus.unit.kind === unit.kind
      ? (amount.plus.quantity * amount.plus.unit.toBase!) / written
      : 0
  if (unit.kind === "weight") return unit.toBase! + extra
  if (unit.kind === "count") {
    if (amount.size && "grams" in amount.size) return amount.size.grams
    if (amount.size && "ml" in amount.size) {
      const perMl = bakingDensity(amount.name) ?? density(portions)
      return perMl ? amount.size.ml * perMl : null
    }
    if (unit.id === "stick" && /\bbutter\b/i.test(amount.name)) {
      return STICK_OF_BUTTER_GRAMS
    }
    return null
  }
  const perMl = bakingDensity(amount.name) ?? density(portions, unit.id)
  if (perMl) return (unit.toBase! + extra) * perMl
  return known[unit.id] ?? null
}

/** Grams for one of each line's unit, using what nutrition has learned about each food. */
export async function unitWeights(db: Db | Tx, lines: string[]) {
  const amounts = lines.map((line) => readAmount(line))
  const keys = [...new Set(amounts.flatMap((a) => (a?.unit ? [a.key] : [])))]
  const learned = keys.length
    ? await db
        .select({
          food: foodMatches.food,
          grams: foodMatches.grams,
          portions: fdcFoods.portions,
        })
        .from(foodMatches)
        .leftJoin(fdcFoods, eq(foodMatches.fdcId, fdcFoods.fdcId))
        .where(inArray(foodMatches.food, keys))
    : []
  const byFood = new Map(learned.map((row) => [row.food, row]))
  return amounts.map((amount) => {
    if (!amount) return null
    const found = byFood.get(amount.key)
    return unitGrams(amount, found?.portions ?? [], found?.grams ?? {})
  })
}
