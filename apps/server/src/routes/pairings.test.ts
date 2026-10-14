import type { RecipePairings } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

describe("pairings", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const ids: Record<string, string> = {}

  const pairings = async (id: string) =>
    (await t.admin.get(`/api/recipes/${id}/pairings`)).body as RecipePairings
  const names = (list: { name: string }[]) => list.map((r) => r.name)

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
    for (const [name, tags] of [
      ["Chicken + Rice", ["dinner"]],
      ["Teriyaki Sauce", ["sauce"]],
      ["Peanut Sauce", ["Sauce"]],
      ["Chimichurri", ["sauce"]],
      ["Pancakes", ["breakfast"]],
    ] as const) {
      const res = await t.admin.post("/api/recipes", {
        name,
        servings: 4,
        tags,
        ingredients: ["1 thing"],
      })
      ids[name] = res.body.recipe.id
    }
  })
  afterAll(() => t.close())

  test("starts with nothing", async () => {
    expect(await pairings(ids["Chicken + Rice"]!)).toEqual({
      pairings: [],
      options: [],
      pairsWith: [],
    })
  })

  test("pairs picked recipes, and every recipe with a tag", async () => {
    const base = ids["Chicken + Rice"]!
    const picked = await t.admin.post(`/api/recipes/${base}/pairings`, {
      recipes: [ids.Chimichurri, base],
    })
    expect(picked.status).toBe(200)
    // A recipe can't go with itself.
    expect(names(picked.body.options)).toEqual(["Chimichurri"])

    const tagged = await t.admin.post(`/api/recipes/${base}/pairings`, {
      tag: "SAUCE",
    })
    const result = tagged.body as RecipePairings
    expect(
      result.pairings.map((p) =>
        p.kind === "tag" ? `#${p.tag}` : p.recipe.name
      )
    ).toEqual(["Chimichurri", "#sauce"])
    // Picked first, then tagged by name, without repeats.
    expect(names(result.options)).toEqual([
      "Chimichurri",
      "Peanut Sauce",
      "Teriyaki Sauce",
    ])

    // Adding the same again changes nothing.
    await t.admin.post(`/api/recipes/${base}/pairings`, { tag: "sauce" })
    expect((await pairings(base)).pairings).toHaveLength(2)

    expect(
      (await t.admin.post(`/api/recipes/${base}/pairings`, { tag: "nope" }))
        .status
    ).toBe(400)
    expect(
      (await t.admin.post(`/api/recipes/${base}/pairings`, {})).status
    ).toBe(400)
  })

  test("shows the other way round what a recipe goes with", async () => {
    expect(names((await pairings(ids["Peanut Sauce"]!)).pairsWith)).toEqual([
      "Chicken + Rice",
    ])
    expect((await pairings(ids.Pancakes!)).pairsWith).toEqual([])
  })

  test("removes a pairing", async () => {
    const base = ids["Chicken + Rice"]!
    const tag = (await pairings(base)).pairings.find((p) => p.kind === "tag")!
    const res = await t.admin.delete(`/api/recipes/${base}/pairings/${tag.id}`)
    expect(names(res.body.options)).toEqual(["Chimichurri"])
    expect(
      (await t.admin.delete(`/api/recipes/${base}/pairings/${tag.id}`)).status
    ).toBe(404)
  })

  test("goes when either recipe is deleted", async () => {
    const base = ids["Chicken + Rice"]!
    await t.admin.delete(`/api/recipes/${ids.Chimichurri}`)
    expect(await pairings(base)).toMatchObject({ pairings: [], options: [] })
  })

  test("is per household", async () => {
    await t.admin.put("/api/server/settings", { signupOpen: true })
    const other = apiClient(t.app)
    await other.post("/api/signup", {
      displayName: "Dana",
      username: "dana",
      password: "a long enough password",
      householdName: "Next Door",
    })
    const theirs = (
      await other.post("/api/recipes", { name: "Their Sauce", ingredients: [] })
    ).body.recipe
    const base = ids["Chicken + Rice"]!
    expect((await other.get(`/api/recipes/${base}/pairings`)).status).toBe(404)
    expect(
      (await other.post(`/api/recipes/${base}/pairings`, { tag: "sauce" }))
        .status
    ).toBe(404)
    // Nor can another household's recipe be paired here.
    expect(
      (
        await t.admin.post(`/api/recipes/${base}/pairings`, {
          recipes: [theirs.id],
        })
      ).status
    ).toBe(404)
  })
})
