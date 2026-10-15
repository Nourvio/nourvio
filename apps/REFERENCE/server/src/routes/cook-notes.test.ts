import type { CookNote, Proposal, Recipe } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import type { AiProviderFactory } from "../ai/types.ts"
import { createTestAppWithAdmin } from "../test/helpers.ts"

/** Reads "more salt" as a change and anything else as an opinion. */
function fakeAi() {
  const prompts: string[] = []
  const factory: AiProviderFactory = (id) => ({
    id,
    async listModels() {
      return []
    },
    async extract(request) {
      const text = (request.parts[0] as { text: string }).text
      prompts.push(text)
      const salty = /more salt/i.test(text)
      return {
        data: {
          change: salty,
          summary: salty ? "Doubles the salt." : "",
          servings: null,
          ingredients: salty
            ? ["2 lb tomatoes", "2 tsp salt", "1 cup cream"]
            : null,
          steps: null,
          notes: null,
        } as never,
        usage: { inputTokens: 100, outputTokens: 20 },
      }
    },
  })
  return { prompts, factory }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("how did it go", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const ai = fakeAi()
  let soup: Recipe

  const notes = async () =>
    (await t.admin.get(`/api/recipes/${soup.id}/cook-notes`)).body
      .notes as CookNote[]
  const suggestion = async () =>
    (await t.admin.get(`/api/recipes/${soup.id}/proposal`)).body
      .proposal as Proposal | null

  beforeAll(async () => {
    t = await createTestAppWithAdmin({ aiFactory: ai.factory })
    soup = (
      await t.admin.post("/api/recipes", {
        name: "Tomato Soup",
        ingredients: ["2 lb tomatoes", "1 tsp salt", "1 cup cream"],
        steps: ["Simmer the tomatoes.", "Blend with the cream."],
      })
    ).body.recipe
  })
  afterAll(() => t.close())

  test("needs stars or a note", async () => {
    const res = await t.admin.post(`/api/recipes/${soup.id}/cook-notes`, {
      rating: null,
      note: "  ",
    })
    expect(res.status).toBe(400)
  })

  test("stars become the recipe's rating; without AI a note is just kept", async () => {
    const res = await t.admin.post(`/api/recipes/${soup.id}/cook-notes`, {
      rating: 4,
      note: "Needed more salt",
    })
    expect(res.status).toBe(201)
    expect(res.body.suggesting).toBe(false)
    expect(res.body.note).toMatchObject({
      rating: 4,
      note: "Needed more salt",
      by: t.adminUser.displayName,
    })
    const recipe = (await t.admin.get(`/api/recipes/${soup.id}`)).body
      .recipe as Recipe
    expect(recipe.rating).toBe(4)
    expect(await suggestion()).toBeNull()
  })

  test("with AI, a note becomes a suggested change on the recipe page", async () => {
    await t.admin.put("/api/ai/settings", {
      keys: { anthropic: "sk-ant-test-key-1234" },
    })
    const res = await t.admin.post(`/api/recipes/${soup.id}/cook-notes`, {
      rating: null,
      note: "Still wants more salt, honestly",
    })
    expect(res.body.suggesting).toBe(true)
    let waiting: Proposal | null = null
    for (let i = 0; i < 50 && !waiting; i++) {
      await sleep(20)
      waiting = await suggestion()
    }
    expect(waiting).toMatchObject({
      kind: "recipe_edit",
      summary: "Doubles the salt.",
      fromNote: "Still wants more salt, honestly",
      after: { ingredients: ["2 lb tomatoes", "2 tsp salt", "1 cup cream"] },
    })
    expect(ai.prompts.at(-1)).toContain("Simmer the tomatoes.")
    expect(ai.prompts.at(-1)).toContain("Still wants more salt, honestly")

    // Applying it changes the recipe.
    await t.admin.post(`/api/proposals/${waiting!.id}/apply`, {
      sections: ["ingredients"],
    })
    const recipe = (await t.admin.get(`/api/recipes/${soup.id}`)).body
      .recipe as Recipe
    expect(recipe.ingredients.map((i) => i.text)).toContain("2 tsp salt")
  })

  test("an opinion is kept, with nothing to change", async () => {
    const before = ai.prompts.length
    await t.admin.post(`/api/recipes/${soup.id}/cook-notes`, {
      rating: 5,
      note: "The kids loved it",
    })
    for (let i = 0; i < 50 && ai.prompts.length === before; i++) {
      await sleep(20)
    }
    await sleep(50)
    expect(await suggestion()).toBeNull()
  })

  test("lists newest first, and a note can be deleted", async () => {
    const list = await notes()
    expect(list.map((n) => n.note)).toEqual([
      "The kids loved it",
      "Still wants more salt, honestly",
      "Needed more salt",
    ])
    const res = await t.admin.delete(
      `/api/recipes/${soup.id}/cook-notes/${list[0]!.id}`
    )
    expect(res.status).toBe(204)
    expect(await notes()).toHaveLength(2)
  })
})
