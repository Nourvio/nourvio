import type { Recipe, Substitute } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import type { AiProviderFactory } from "../ai/types.ts"
import { createTestAppWithAdmin } from "../test/helpers.ts"

/** Suggests milk and lemon, yogurt, and (wrongly) a mushroom cream the household avoids. */
function fakeAi() {
  const calls: { text: string; model: string }[] = []
  const factory: AiProviderFactory = (id) => ({
    id,
    async listModels() {
      return []
    },
    async extract(request) {
      calls.push({
        text: (request.parts[0] as { text: string }).text,
        model: request.model,
      })
      return {
        data: {
          substitutes: [
            {
              lines: ["1 cup milk", "1 tbsp lemon juice"],
              note: "Stir together and let sit 5 minutes.",
              inPantry: true,
              steps: [
                {
                  step: 2,
                  text: "Cook on a hot griddle, a minute longer a side.",
                },
                // The same as before, and a step that isn't there: dropped.
                { step: 1, text: "Whisk everything." },
                { step: 9, text: "Serve." },
              ],
            },
            {
              lines: ["3/4 cup plain yogurt", "1/4 cup water"],
              note: "Whisk smooth.",
              inPantry: false,
              steps: [],
            },
            {
              lines: ["1 cup cream of mushroom soup"],
              note: "Thicker.",
              inPantry: false,
              steps: [],
            },
          ],
        } as never,
        usage: { inputTokens: 100, outputTokens: 30 },
      }
    },
  })
  return { calls, factory }
}

describe("swapping an ingredient", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const ai = fakeAi()
  let pancakes: Recipe

  const buttermilk = () =>
    pancakes.ingredients.find((i) => i.text.includes("buttermilk"))!

  beforeAll(async () => {
    t = await createTestAppWithAdmin({ aiFactory: ai.factory })
    pancakes = (
      await t.admin.post("/api/recipes", {
        name: "Buttermilk Pancakes",
        servings: 4,
        ingredients: [
          "# Batter",
          "2 cups flour",
          "2 cups buttermilk",
          "2 eggs",
        ],
        steps: ["Whisk everything.", "Cook on a hot griddle."],
      })
    ).body.recipe
    await t.admin.post("/api/pantry", { text: "1 gallon milk" })
    await t.admin.put("/api/household/tastes", {
      avoid: [{ food: "mushrooms", who: "Jamie", allergy: false }],
      diets: [],
      weeknightMinutes: null,
      notes: [],
    })
  })
  afterAll(() => t.close())

  test("needs AI", async () => {
    const res = await t.admin.post(`/api/recipes/${pancakes.id}/substitutes`, {
      ingredientId: buttermilk().id,
    })
    expect(res.status).toBe(400)
  })

  test("suggests swaps on a small model, knowing the pantry and the rules", async () => {
    await t.admin.put("/api/ai/settings", {
      keys: { anthropic: "sk-ant-test-key-1234" },
    })
    const res = await t.admin.post(`/api/recipes/${pancakes.id}/substitutes`, {
      ingredientId: buttermilk().id,
    })
    expect(res.status).toBe(200)
    const substitutes = res.body.substitutes as Substitute[]
    // The mushroom one is dropped: Jamie doesn't eat mushrooms.
    expect(substitutes.map((s) => s.lines)).toEqual([
      ["1 cup milk", "1 tbsp lemon juice"],
      ["3/4 cup plain yogurt", "1/4 cup water"],
    ])
    // Steps that change with a swap, by the step's id.
    expect(substitutes[0]!.steps).toEqual([
      {
        stepId: pancakes.steps[1]!.id,
        text: "Cook on a hot griddle, a minute longer a side.",
      },
    ])
    expect(substitutes[1]!.steps).toEqual([])
    const call = ai.calls.at(-1)!
    expect(call.model).toBe("claude-haiku-5-5")
    expect(call.text).toContain("Instead of: 2 cups buttermilk")
    expect(call.text).toContain("At home: milk")
    expect(call.text).toContain("Jamie doesn't eat mushrooms")
    expect(call.text).toContain("2. Cook on a hot griddle.")
  })

  test("saves a swap to the recipe, in place, and it can be undone", async () => {
    const res = await t.admin.post(`/api/recipes/${pancakes.id}/swap`, {
      ingredientId: buttermilk().id,
      lines: ["2 cups milk", "2 tbsp lemon juice"],
      steps: [
        {
          stepId: pancakes.steps[1]!.id,
          text: "Cook on a hot griddle, a minute longer a side.",
        },
      ],
    })
    expect(res.status).toBe(200)
    const swapped = res.body.recipe as Recipe
    expect(swapped.steps.map((s) => s.text)).toEqual([
      "Whisk everything.",
      "Cook on a hot griddle, a minute longer a side.",
    ])
    expect(swapped.ingredients.map((i) => [i.section, i.text])).toEqual([
      ["Batter", "2 cups flour"],
      ["Batter", "2 cups milk"],
      ["Batter", "2 tbsp lemon juice"],
      ["Batter", "2 eggs"],
    ])

    // The old ingredient is gone, so swapping it again is refused.
    const stale = await t.admin.post(`/api/recipes/${pancakes.id}/swap`, {
      ingredientId: buttermilk().id,
      lines: ["2 cups oat milk"],
    })
    expect(stale.status).toBe(409)

    const undone = await t.admin.post(
      `/api/recipes/${pancakes.id}/versions/${res.body.undoVersionId}/restore`
    )
    expect(
      (undone.body.recipe as Recipe).ingredients.map((i) => i.text)
    ).toContain("2 cups buttermilk")
  })
})
