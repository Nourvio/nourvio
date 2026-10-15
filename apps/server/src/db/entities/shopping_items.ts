import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { aisleRef } from "./aisles.ts"
import { amount, createdAt, foodKey, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"
import { ShoppingList } from "./shopping_lists.ts"

export const ITEM_SOURCES = [
  "plan",
  "typed",
  "every-week",
  "usual",
  "assistant",
] as const

export const ShoppingItem = defineEntity({
  name: "ShoppingItem",
  tableName: "shopping_items",
  properties: {
    id: id(),
    household: () => householdRef(),
    list: () => p.manyToOne(ShoppingList).ref().deleteRule("cascade").index(),
    /** Merges the same food from different recipes into one line. */
    foodKey: foodKey().nullable(),
    name: p.string(),
    ...amount(),
    aisle: () => aisleRef(),
    checked: p.boolean().default(false),
    checkedAt: p.datetime().nullable(),
    source: p.enum(ITEM_SOURCES),
    /** Ids of the planned meals it's for. */
    forMeals: p.json<string[]>().nullable(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  filters: householdFilter,
})
export type ShoppingItem = InferEntity<typeof ShoppingItem>
