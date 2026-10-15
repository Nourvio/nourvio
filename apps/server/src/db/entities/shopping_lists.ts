import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"

/**
 * A shopping list, for a store or for none. Every household has one main
 * list, which takes anything not sent elsewhere.
 */
export const ShoppingList = defineEntity({
  name: "ShoppingList",
  tableName: "shopping_lists",
  properties: {
    id: id(),
    household: () => householdRef(),
    name: p.string(),
    /** A store's key ("kroger", "costco"), or none. */
    store: p.string().nullable(),
    main: p.boolean().default(false),
    position: p.integer().default(0),
    /** Ids of the aisles that go on this list. */
    aisles: p.json<string[]>().nullable(),
    createdAt: createdAt(),
  },
  filters: householdFilter,
})
export type ShoppingList = InferEntity<typeof ShoppingList>
