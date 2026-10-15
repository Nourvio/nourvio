import type {
  MealSuggestion,
  RecipeCostDetail,
  RecipeCosts,
  StoreProduct,
} from "@mise/shared"
import { addDays, toIsoDate } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { storeProducts } from "../db/schema.ts"
import { createTestAppWithAdmin } from "../test/helpers.ts"

const product = (
  id: string,
  name: string,
  size: string,
  price: number,
  salePrice: number | null = null
): StoreProduct => ({
  id,
  upc: id,
  name,
  brand: null,
  size,
  image: null,
  price,
  salePrice,
  aisle: null,
  aisleNumber: null,
  inStock: true,
  url: null,
})

describe("recipe costs", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  let recipeId: string

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
    const household = (await t.admin.get("/api/household")).body.household
    const recipe = await t.admin.post("/api/recipes", {
      name: "Chicken and Tomatoes",
      servings: 4,
      ingredients: [
        "2 lb chicken thighs",
        "2 tbsp olive oil",
        "3 onions",
        "2 cans diced tomatoes",
        "1 cup rice",
        "Salt to taste",
      ],
    })
    recipeId = recipe.body.recipe.id
    await t.db.insert(storeProducts).values(
      [
        ["chicken thigh", product("1", "Chicken Thighs", "3 lb", 9)],
        ["olive oil", product("2", "Olive Oil", "16.9 fl oz", 10)],
        ["onion", product("3", "Yellow Onion", "1 each", 0.99)],
        // On sale: the sale price counts.
        ["diced tomato", product("4", "Diced Tomatoes", "14.5 oz", 1.5, 1.25)],
      ].map(([food, p]) => ({
        householdId: household.id,
        shop: "kroger" as const,
        food: food as string,
        product: p as StoreProduct,
      }))
    )
  })
  afterAll(() => t.close())

  test("each ingredient's share of its package, at today's price", async () => {
    const { cost } = (await t.admin.get(`/api/recipes/${recipeId}/cost`))
      .body as { cost: RecipeCostDetail }
    const line = (text: string) => cost.lines.find((l) => l.text === text)!
    // Two thirds of a 3 lb pack.
    expect(line("2 lb chicken thighs").cost).toBe(6)
    // 2 tbsp of a 500 ml bottle.
    expect(line("2 tbsp olive oil")).toMatchObject({ cost: 0.59, sure: true })
    expect(line("3 onions").cost).toBe(2.97)
    expect(line("2 cans diced tomatoes").cost).toBe(2.5)
    expect(line("1 cup rice")).toMatchObject({ product: null, cost: null })
    expect(line("Salt to taste")).toMatchObject({ onHand: true, cost: null })
    expect(cost).toMatchObject({ total: 12.06, priced: 4, counted: 5 })
    expect(cost.perServing).toBeCloseTo(3.02, 1)
  })

  test("every recipe's cost at once, and in suggestions", async () => {
    const costs = (await t.admin.get("/api/recipes/costs")).body
      .costs as RecipeCosts
    expect(costs[recipeId]).toEqual({
      total: 12.06,
      perServing: expect.any(Number),
      priced: 4,
      counted: 5,
    })
    const suggestions = (
      await t.admin.post("/api/plan/suggest", {
        slots: [{ date: addDays(toIsoDate(new Date()), 1), meal: "dinner" }],
      })
    ).body.suggestions as MealSuggestion[]
    expect(suggestions[0]).toMatchObject({
      recipe: { id: recipeId },
      cost: 12.06,
    })
  })

  test("the household can set a weekly budget", async () => {
    const res = await t.admin.patch("/api/household", { weeklyBudget: 120 })
    expect(res.body.household.weeklyBudget).toBe(120)
    expect(
      (await t.admin.patch("/api/household", { weeklyBudget: -5 })).status
    ).toBe(400)
    const cleared = await t.admin.patch("/api/household", {
      weeklyBudget: null,
    })
    expect(cleared.body.household.weeklyBudget).toBeNull()
  })
})
