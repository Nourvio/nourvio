import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { id } from "./base.ts"
import { householdRef } from "./households.ts"
import { recipeRef } from "./recipes.ts"

/**
 * One ingredient line. `rawText` is the line as written and is what's shown;
 * the parsed fields drive scaling, the list, the pantry and nutrition.
 */
export const RecipeIngredient = defineEntity({
  name: "RecipeIngredient",
  tableName: "recipe_ingredients",
  properties: {
    id: id(),
    household: () => householdRef(),
    recipe: () => recipeRef(),
    position: p.integer(),
    /** "For the sauce", or none. */
    section: p.string().nullable(),
    rawText: p.text(),
    quantity: p.double().nullable(),
    /** The top of a range ("2 to 3 cloves"). */
    quantityMax: p.double().nullable(),
    unit: p.string().nullable(),
    food: p.string().nullable(),
    note: p.text().nullable(),
  },
  filters: householdFilter,
})
export type RecipeIngredient = InferEntity<typeof RecipeIngredient>
