import {
  foodKey,
  guessSection,
  parseIngredient,
  type StoreSectionId,
} from "@mise/shared"
import { and, eq, inArray } from "drizzle-orm"

import type { Db } from "../db/client.ts"
import { foodSections } from "../db/schema.ts"

/** Where to file a food: the household's own choice, else a guess. */
export async function sectionsFor(
  db: Db,
  householdId: string,
  items: { name: string; unitId?: string | null }[]
) {
  const foods = items.map((item) => foodKey(item.name))
  const learned = foods.length
    ? await db
        .select()
        .from(foodSections)
        .where(
          and(
            eq(foodSections.householdId, householdId),
            inArray(foodSections.food, foods)
          )
        )
    : []
  const byFood = new Map(learned.map((row) => [row.food, row.sectionId]))
  return items.map(
    (item, i): StoreSectionId =>
      byFood.get(foods[i]!) ?? guessSection(item.name, item.unitId)
  )
}

/** An amount as typed: "2 lb" becomes a number and a unit; anything else stays as written. Empty clears it. */
export function readAmount(amount: string) {
  const parsed = amount ? parseIngredient(`${amount} x`) : null
  return parsed?.quantity !== null &&
    parsed?.quantity !== undefined &&
    parsed.food === "x"
    ? {
        quantity: parsed.quantityMax ?? parsed.quantity,
        unitId: parsed.unitId,
        amountText: null,
      }
    : { quantity: null, unitId: null, amountText: amount || null }
}
