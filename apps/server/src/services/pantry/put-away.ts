import {
  DEFAULT_ON_HAND,
  guessStorage,
  guessUseBy,
  onHandTest,
  pantryKey,
  type AisleKey,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  Household,
  Purchase,
  ShoppingItem,
} from "../../database/entities/index.ts"
import { findList } from "../list/lists.ts"
import { inHouseholdTransaction, toNumber } from "../recipes/recipes.ts"
import { householdToday, store } from "./pantry.ts"

/**
 * Done shopping: what's checked off on a list (or all of them) goes in the
 * pantry, set aside for the meals it was bought for, in the fridge, freezer
 * or cupboard with a use-by guess for fresh food. Household things and
 * what's always on hand are cleared without going in. Everything bought
 * goes in the purchase history, for usual buys.
 */
export async function putAway(
  em: EntityManager,
  householdId: string,
  { list }: { list?: string | null } = {}
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const household = await tx.findOneOrFail(Household, { id: householdId })
    const isOnHand = onHandTest(
      household.settings?.alwaysOnHand ?? DEFAULT_ON_HAND
    )
    const from = list ? await findList(tx, list) : null
    const checked = await tx.find(
      ShoppingItem,
      from ? { checked: true, list: from.id } : { checked: true },
      { populate: ["aisle"], orderBy: { createdAt: "asc" } }
    )
    const today = await householdToday(tx, householdId)
    let stored = 0
    for (const item of checked) {
      const quantity = toNumber(item.quantity)
      tx.create(Purchase, {
        household: householdId,
        foodKey: pantryKey(item.name),
        name: item.name,
        quantity,
        unit: item.unit ?? null,
        amountText: item.amountText ?? null,
        boughtOn: today,
      })
      const aisle = item.aisle?.getEntity() ?? null
      const key = (aisle?.key as AisleKey | null | undefined) ?? null
      tx.remove(item)
      if (key === "household" || isOnHand(item.name)) continue
      const storedIn = guessStorage(item.name, key)
      await store(tx, householdId, {
        name: item.name,
        quantity,
        unit: item.unit ?? null,
        amountText: item.amountText ?? null,
        aisle,
        storedIn,
        useBy: guessUseBy(item.name, key, storedIn, today),
        forMeals: item.forMeals ?? [],
      })
      // So the next of the same food joins it.
      await tx.flush()
      stored++
    }
    await tx.flush()
    return { stored, cleared: checked.length - stored }
  })
}
