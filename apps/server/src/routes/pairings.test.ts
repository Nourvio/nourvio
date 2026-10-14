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

describe("pairings on the plan", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const ids: Record<string, string> = {}

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
    const recipes = [
      {
        name: "Chicken + Rice",
        servings: 4,
        tags: ["dinner"],
        ingredients: ["1 lb chicken", "1 cup rice"],
      },
      {
        name: "Teriyaki Sauce",
        servings: 8,
        tags: ["sauce"],
        ingredients: ["1 cup soy sauce", "4 tbsp honey"],
      },
      {
        name: "Peanut Sauce",
        servings: 4,
        tags: ["sauce"],
        ingredients: ["1/2 cup peanut butter"],
      },
      {
        name: "Chili",
        servings: 4,
        tags: ["dinner"],
        ingredients: ["1 lb ground beef"],
      },
    ]
    for (const recipe of recipes) {
      ids[recipe.name] = (
        await t.admin.post("/api/recipes", recipe)
      ).body.recipe.id
    }
    await t.admin.post(`/api/recipes/${ids["Chicken + Rice"]}/pairings`, {
      tag: "sauce",
    })
  })
  afterAll(() => t.close())

  test("plans a meal with something it goes with, and lists both", async () => {
    const res = await t.admin.post("/api/plan/entries", {
      date: "2026-11-02",
      meal: "dinner",
      recipeId: ids["Chicken + Rice"],
      withRecipeId: ids["Teriyaki Sauce"],
    })
    expect(res.status).toBe(201)
    expect(res.body.entry.with).toMatchObject({ name: "Teriyaki Sauce" })

    await t.admin.post("/api/list/from-plan", {
      from: "2026-11-02",
      to: "2026-11-02",
    })
    const items = (await t.admin.get("/api/list")).body.items as {
      name: string
      amount: string
      recipes: string[]
    }[]
    // The sauce makes 8 servings; half a batch goes with 4.
    expect(items.find((i) => i.name === "soy sauce")).toMatchObject({
      amount: "½ cup",
      recipes: ["Teriyaki Sauce"],
    })
    expect(items.find((i) => i.name === "chicken")?.amount).toBe("1 lb")

    // Changing what it's made with; null for nothing.
    const changed = await t.admin.patch(
      `/api/plan/entries/${res.body.entry.id}`,
      {
        withRecipeId: null,
      }
    )
    expect(changed.body.entry.with).toBeNull()
    expect(changed.body.entry.listed).toBe(false)
  })

  test("cooking it marks both made", async () => {
    const entry = (
      await t.admin.post("/api/plan/entries", {
        date: "2026-11-03",
        meal: "dinner",
        recipeId: ids["Chicken + Rice"],
        withRecipeId: ids["Peanut Sauce"],
      })
    ).body.entry
    await t.admin.patch(`/api/plan/entries/${entry.id}`, { status: "cooked" })
    const sauce = (await t.admin.get(`/api/recipes/${ids["Peanut Sauce"]}`))
      .body.recipe
    expect(sauce.lastMadeAt).not.toBeNull()
  })

  test("suggests a sauce with what goes with one, and never a sauce alone", async () => {
    // Chicken + Rice was just cooked, so a pasta that goes with any sauce.
    const pasta = (
      await t.admin.post("/api/recipes", {
        name: "Pasta",
        servings: 4,
        tags: ["dinner"],
        ingredients: ["1 lb pasta"],
      })
    ).body.recipe
    await t.admin.post(`/api/recipes/${pasta.id}/pairings`, { tag: "sauce" })
    const slots = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-12-0${i + 1}`,
      meal: "dinner",
    }))
    const res = await t.admin.post("/api/plan/suggest", { slots })
    const suggestions = res.body.suggestions as {
      recipe: { name: string }
      with: { name: string } | null
    }[]
    expect(
      suggestions.map((s) => s.recipe.name).filter((n) => n.includes("Sauce"))
    ).toEqual([])
    const withPasta = suggestions.find((s) => s.recipe.name === "Pasta")
    expect(withPasta?.with?.name).toMatch(/Sauce$/)
    expect(suggestions.find((s) => s.recipe.name === "Chili")?.with).toBeNull()
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
      await other.post("/api/recipes", { name: "Toast", ingredients: [] })
    ).body.recipe
    const res = await other.post("/api/plan/entries", {
      date: "2026-11-05",
      meal: "dinner",
      recipeId: theirs.id,
      withRecipeId: ids["Teriyaki Sauce"],
    })
    expect(res.status).toBe(404)
  })
})
