import type { Recipe, RecipeSummary } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

describe("diet labels and tags", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  let soup: Recipe

  const list = async () =>
    (await t.admin.get("/api/recipes")).body.recipes as RecipeSummary[]
  const tagNames = async () =>
    (await t.admin.get("/api/recipes/tags")).body.tags
      .map((tag: { name: string; count: number }) => `${tag.name} ${tag.count}`)
      .sort((a: string, b: string) => a.localeCompare(b))

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
    soup = (
      await t.admin.post("/api/recipes", {
        name: "Squash Soup",
        ingredients: [
          "1 butternut squash",
          "4 cups vegetable broth",
          "1 tsp nutmeg",
        ],
        tags: ["Soup", "dinners"],
      })
    ).body.recipe
    await t.admin.post("/api/recipes", {
      name: "Chili",
      ingredients: ["1 lb ground beef", "1 can kidney beans"],
      tags: ["Dinner"],
    })
  })
  afterAll(() => t.close())

  test("works out diet labels from the ingredients", async () => {
    const recipes = await list()
    expect(recipes.find((r) => r.name === "Squash Soup")!.diets).toEqual([
      "vegetarian",
      "vegan",
      "gluten-free",
      "dairy-free",
      "egg-free",
      "nut-free",
    ])
    expect(recipes.find((r) => r.name === "Chili")!.diets).toEqual([
      "gluten-free",
      "dairy-free",
      "egg-free",
      "nut-free",
    ])
  })

  test("takes the household's corrections", async () => {
    const res = await t.admin.put(`/api/recipes/${soup.id}/diets`, {
      overrides: { vegan: false },
    })
    expect(res.status).toBe(200)
    expect(res.body.recipe.dietOverrides).toEqual({ vegan: false })
    expect(res.body.recipe.diets).not.toContain("vegan")
    // Saving the recipe keeps them.
    await t.admin.put(`/api/recipes/${soup.id}`, {
      name: "Squash Soup",
      ingredients: ["1 butternut squash", "4 cups vegetable broth"],
      tags: ["Soup", "dinners"],
    })
    const after = (await t.admin.get(`/api/recipes/${soup.id}`)).body.recipe
    expect(after.diets).not.toContain("vegan")
    expect(
      (
        await t.admin.put(`/api/recipes/${soup.id}/diets`, {
          overrides: { keto: true },
        })
      ).status
    ).toBe(400)
  })

  test("renames tags, merging into one that exists", async () => {
    expect(await tagNames()).toEqual(["Dinner 1", "dinners 1", "Soup 1"])
    const merged = await t.admin.patch("/api/recipes/tags/dinners", {
      name: "dinner",
    })
    expect(merged.status).toBe(200)
    expect(await tagNames()).toEqual(["Dinner 2", "Soup 1"])
    const recipes = await list()
    expect(recipes.find((r) => r.name === "Squash Soup")!.tags.sort()).toEqual([
      "Dinner",
      "Soup",
    ])

    await t.admin.patch("/api/recipes/tags/Soup", { name: "Soups" })
    expect(await tagNames()).toEqual(["Dinner 2", "Soups 1"])
    expect(
      (await t.admin.patch("/api/recipes/tags/nope", { name: "x" })).status
    ).toBe(404)
  })

  test("deletes a tag from every recipe", async () => {
    expect((await t.admin.delete("/api/recipes/tags/Soups")).status).toBe(200)
    expect(await tagNames()).toEqual(["Dinner 2"])
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
    expect(
      (await other.patch("/api/recipes/tags/Dinner", { name: "Mine" })).status
    ).toBe(404)
    expect((await other.delete("/api/recipes/tags/Dinner")).status).toBe(404)
    expect(
      (await other.put(`/api/recipes/${soup.id}/diets`, { overrides: {} }))
        .status
    ).toBe(404)
    expect(await tagNames()).toEqual(["Dinner 2"])
  })
})
