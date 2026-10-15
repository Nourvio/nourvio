import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { aisleRef } from "./aisles.ts"
import { amount, createdAt, day, foodKey, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"

export const STORAGE_PLACES = ["fridge", "freezer", "cupboard"] as const

export const PantryItem = defineEntity({
  name: "PantryItem",
  tableName: "pantry_items",
  properties: {
    id: id(),
    household: () => householdRef(),
    /** The pantry's match key: prep and quality words dropped ("chicken thigh"). */
    foodKey: foodKey(),
    name: p.string(),
    ...amount(),
    aisle: () => aisleRef(),
    storedIn: p.enum(STORAGE_PLACES).nullable(),
    useBy: day().nullable(),
    /** Ids of the planned meals it was bought for. */
    forMeals: p.json<string[]>().nullable(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  indexes: [{ properties: ["household", "foodKey"] }],
  filters: householdFilter,
})
export type PantryItem = InferEntity<typeof PantryItem>
