import {
  addDays,
  toIsoDate,
  type DeletedRecipe,
  type PlanEntry,
  type RecipeSummary,
  type ShoppingItem,
  type Tag,
} from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { purgeExpiredRecipes } from "../services/recipes.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

describe("recipes in bulk, and Recently deleted", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const ids: Record<string, string> = {}
  const tomorrow = addDays(toIsoDate(new Date()), 1)

  const names = async () =>
    ((await t.admin.get("/api/recipes")).body.recipes as RecipeSummary[])
      .map((r) => r.name)
      .sort()
  const bulk = (body: Record<string, unknown>) =>
    t.admin.post("/api/recipes/bulk", body)
  const deleted = async () =>
    (await t.admin.get("/api/recipes/deleted")).body.recipes as DeletedRecipe[]

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
    for (const recipe of [
      { name: "Tacos", tags: ["dinner"], ingredients: ["1 lb ground beef"] },
      { name: "Pesto Pasta", tags: ["dinner"], ingredients: ["1 lb pasta"] },
      { name: "Lentil Soup", tags: ["soup"], ingredients: ["1 cup lentils"] },
    ]) {
      const res = await t.admin.post("/api/recipes", recipe)
      ids[recipe.name] = res.body.recipe.id
    }
    await t.admin.post("/api/plan/entries", {
      date: tomorrow,
      meal: "dinner",
      recipeId: ids.Tacos,
    })
  })
  afterAll(() => t.close())

  test("deleting moves recipes to Recently deleted, off everything else", async () => {
    const res = await bulk({
      action: "delete",
      ids: [ids.Tacos, ids["Pesto Pasta"]],
    })
    expect(res.body).toEqual({ changed: 2 })
    expect(await names()).toEqual(["Lentil Soup"])
    expect((await t.admin.get(`/api/recipes/${ids.Tacos}`)).status).toBe(404)

    const gone = await deleted()
    expect(gone.map((r) => r.name).sort()).toEqual(["Pesto Pasta", "Tacos"])
    const days =
      (Date.parse(gone[0]!.goneAt) - Date.parse(gone[0]!.deletedAt)) /
      86_400_000
    expect(days).toBe(30)

    // Their planned meals and tags are out of sight too.
    const plan = (
      await t.admin.get(`/api/plan?from=${tomorrow}&to=${tomorrow}`)
    ).body.entries as PlanEntry[]
    expect(plan).toEqual([])
    const tags = (await t.admin.get("/api/recipes/tags")).body.tags as Tag[]
    expect(tags.map((tag) => tag.name)).toEqual(["soup"])
  })

  test("restoring brings a recipe back, its planned meal too", async () => {
    expect((await bulk({ action: "restore", ids: [ids.Tacos] })).body).toEqual({
      changed: 1,
    })
    expect(await names()).toEqual(["Lentil Soup", "Tacos"])
    const plan = (
      await t.admin.get(`/api/plan?from=${tomorrow}&to=${tomorrow}`)
    ).body.entries as PlanEntry[]
    expect(plan.map((entry) => entry.recipe?.name)).toEqual(["Tacos"])
  })

  test("deleting for good only works from Recently deleted", async () => {
    // Lentil Soup isn't deleted, so it stays.
    expect(
      (await bulk({ action: "purge", ids: [ids["Lentil Soup"]] })).body
    ).toEqual({ changed: 0 })
    expect(
      (await bulk({ action: "purge", ids: [ids["Pesto Pasta"]] })).body
    ).toEqual({ changed: 1 })
    expect(await deleted()).toEqual([])
    expect(
      (await bulk({ action: "restore", ids: [ids["Pesto Pasta"]] })).body
    ).toEqual({ changed: 0 })
  })

  test("after 30 days they go by themselves", async () => {
    await bulk({ action: "delete", ids: [ids["Lentil Soup"]] })
    expect(await purgeExpiredRecipes(t.db, new Date())).toBe(0)
    expect(
      await purgeExpiredRecipes(t.db, new Date(Date.now() + 31 * 86_400_000))
    ).toBe(1)
    expect(await deleted()).toEqual([])
  })

  test("tags go on and come off many at once", async () => {
    const soup = await t.admin.post("/api/recipes", {
      name: "Tomato Soup",
      ingredients: ["2 cans tomatoes", "1 onion"],
    })
    const both = [ids.Tacos!, soup.body.recipe.id as string]
    expect(
      (await bulk({ action: "addTags", ids: both, tags: ["To try", "quick"] }))
        .body
    ).toEqual({ changed: 2 })
    // Again changes nothing, and the spelling already used wins.
    expect(
      (await bulk({ action: "addTags", ids: both, tags: ["to try"] })).body
    ).toEqual({ changed: 0 })
    const tagged = (await t.admin.get("/api/recipes?tag=to%20try")).body
      .recipes as RecipeSummary[]
    expect(tagged).toHaveLength(2)
    expect(
      (await bulk({ action: "removeTags", ids: [ids.Tacos], tags: ["QUICK"] }))
        .body
    ).toEqual({ changed: 1 })
    const tacos = (await t.admin.get(`/api/recipes/${ids.Tacos}`)).body.recipe
    expect(tacos.tags.sort()).toEqual(["To try", "dinner"])
  })

  test("their ingredients go on the list", async () => {
    const soup = (await t.admin.get("/api/recipes")).body.recipes.find(
      (r: RecipeSummary) => r.name === "Tomato Soup"
    )
    const res = await bulk({ action: "toList", ids: [ids.Tacos, soup.id] })
    expect(res.body.changed).toBe(3)
    const list = (await t.admin.get("/api/list")).body.items as ShoppingItem[]
    expect(list.map((item) => item.name).sort()).toEqual([
      "ground beef",
      "onion",
      "tomatoes",
    ])
    expect(list.find((item) => item.name === "onion")?.recipes).toEqual([
      "Tomato Soup",
    ])
  })

  test("nutrition, photos and tidying start in the background", async () => {
    for (const action of ["nutrition", "photos", "tidy"]) {
      expect((await bulk({ action, ids: [ids.Tacos] })).body).toEqual({
        changed: 1,
      })
    }
  })

  test("another household's recipes are out of reach", async () => {
    await t.admin.put("/api/server/settings", { signupOpen: true })
    const neighbor = apiClient(t.app)
    await neighbor.post("/api/signup", {
      householdName: "Next Door",
      displayName: "Dana",
      username: "dana",
      password: "correct horse battery",
    })
    expect(
      (
        await neighbor.post("/api/recipes/bulk", {
          action: "delete",
          ids: [ids.Tacos],
        })
      ).body
    ).toEqual({ changed: 0 })
    expect((await neighbor.get("/api/recipes/deleted")).body.recipes).toEqual(
      []
    )
    expect(await names()).toContain("Tacos")
    expect(
      (await t.admin.post("/api/recipes/bulk", { action: "delete", ids: [] }))
        .status
    ).toBe(400)
  })
})
