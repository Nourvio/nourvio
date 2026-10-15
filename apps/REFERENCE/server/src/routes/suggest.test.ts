import { addDays, toIsoDate } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { suggestMeals } from "../services/suggest.ts"
import { createTestAppWithAdmin } from "../test/helpers.ts"

describe("meal suggestions", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  let householdId: string
  const ids: Record<string, string> = {}

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
    householdId = t.adminUser.householdId
    const recipes = [
      { name: "Pancakes", tags: ["breakfast"] },
      { name: "Omelet", tags: ["Breakfast"] },
      { name: "Brownies", tags: ["dessert"] },
      { name: "Tacos", tags: ["dinner"], totalMinutes: 30, rating: 5 },
      { name: "Lasagna", tags: [], totalMinutes: 120 },
      { name: "Stir Fry", tags: ["weeknight"], totalMinutes: 25 },
      { name: "Chili", tags: ["dinner"] },
    ]
    for (const recipe of recipes) {
      const res = await t.admin.post("/api/recipes", {
        ...recipe,
        ingredients: ["1 thing"],
      })
      ids[recipe.name] = res.body.recipe.id
    }
    // Chili is on the plan nearby and Stir Fry was just made: neither is suggested.
    await t.admin.post("/api/plan/entries", {
      date: "2026-10-08",
      meal: "dinner",
      recipeId: ids.Chili,
    })
    await t.admin.post(`/api/recipes/${ids["Stir Fry"]}/made`)
  })
  afterAll(() => t.close())

  const names = (suggestions: { recipe: { name: string } }[]) =>
    suggestions.map((s) => s.recipe.name)

  test("matches recipes to meals, without repeats", async () => {
    const suggestions = await suggestMeals(
      t.db,
      householdId,
      [
        { date: "2026-10-12", meal: "breakfast" },
        { date: "2026-10-13", meal: "breakfast" },
        { date: "2026-10-14", meal: "breakfast" },
        { date: "2026-10-12", meal: "dinner" },
        { date: "2026-10-13", meal: "dinner" },
        { date: "2026-10-14", meal: "dinner" },
      ],
      { random: () => 0 }
    )
    // Only two breakfast recipes, so the third breakfast is left empty.
    expect(suggestions.filter((s) => s.meal === "breakfast")).toHaveLength(2)
    expect(
      names(suggestions.filter((s) => s.meal === "breakfast")).sort()
    ).toEqual(["Omelet", "Pancakes"])
    const dinners = names(suggestions.filter((s) => s.meal === "dinner"))
    expect(dinners.sort()).toEqual(["Lasagna", "Tacos"])
    expect(new Set(names(suggestions)).size).toBe(suggestions.length)
  })

  test("leaves out what it's told to", async () => {
    const suggestions = await suggestMeals(
      t.db,
      householdId,
      [{ date: "2026-10-15", meal: "dinner" }],
      { exclude: [ids.Tacos!, ids.Lasagna!] }
    )
    expect(suggestions).toEqual([])
  })

  test("counts a recipe and its versions as one dish", async () => {
    await t.admin.post("/api/recipes", {
      name: "Tacos (vegetarian)",
      tags: ["dinner"],
      ingredients: ["1 thing"],
    })
    const suggestions = await suggestMeals(
      t.db,
      householdId,
      [{ date: "2026-10-15", meal: "dinner" }],
      { exclude: [ids.Tacos!, ids.Lasagna!] }
    )
    expect(suggestions).toEqual([])
    const both = await suggestMeals(t.db, householdId, [
      { date: "2026-10-15", meal: "dinner" },
      { date: "2026-10-16", meal: "dinner" },
      { date: "2026-10-17", meal: "dinner" },
    ])
    expect(names(both).filter((name) => name.startsWith("Tacos"))).toHaveLength(
      1
    )
  })

  test("suggests over the API, then adds the accepted ones at once", async () => {
    const res = await t.admin.post("/api/plan/suggest", {
      slots: [{ date: "2026-10-16", meal: "dinner" }],
    })
    expect(res.status).toBe(200)
    const [suggestion] = res.body.suggestions
    expect(["Tacos", "Tacos (vegetarian)", "Lasagna"]).toContain(
      suggestion.recipe.name
    )

    const added = await t.admin.post("/api/plan/entries/batch", {
      entries: [
        {
          date: suggestion.date,
          meal: suggestion.meal,
          recipeId: suggestion.recipe.id,
        },
        { date: "2026-10-17", meal: "lunch", note: "Leftovers" },
      ],
    })
    expect(added.status).toBe(201)
    expect(added.body.entries).toHaveLength(2)
  })

  test("swaps a planned meal for another recipe", async () => {
    const entry = (
      await t.admin.post("/api/plan/entries", {
        date: "2026-10-18",
        meal: "dinner",
        recipeId: ids.Lasagna,
        servings: 8,
      })
    ).body.entry
    const swapped = await t.admin.patch(`/api/plan/entries/${entry.id}`, {
      recipeId: ids.Tacos,
    })
    expect(swapped.body.entry).toMatchObject({
      recipe: { name: "Tacos" },
      servings: null,
      listed: false,
      status: "planned",
    })
    // Undoing a swap can put the servings back with the recipe.
    const undone = await t.admin.patch(`/api/plan/entries/${entry.id}`, {
      recipeId: ids.Lasagna,
      servings: 8,
    })
    expect(undone.body.entry).toMatchObject({
      recipe: { name: "Lasagna" },
      servings: 8,
    })
  })

  test("uses up what needs using first", async () => {
    await t.admin.post("/api/recipes", {
      name: "Beef Ragu",
      tags: ["dinner"],
      ingredients: ["1 lb ground beef", "1 can tomatoes"],
    })
    const beef = (
      await t.admin.post("/api/pantry", { text: "1 lb ground beef" })
    ).body.item
    await t.admin.patch(`/api/pantry/${beef.id}`, {
      useBy: addDays(toIsoDate(new Date()), 1),
    })
    for (let run = 0; run < 5; run++) {
      const suggestions = await suggestMeals(t.db, householdId, [
        { date: "2026-11-03", meal: "dinner" },
        { date: "2026-11-02", meal: "dinner" },
      ])
      // The earliest night gets it, whatever the dice say.
      const ragu = suggestions.find((s) => s.recipe.name === "Beef Ragu")
      expect(ragu).toMatchObject({ date: "2026-11-02", uses: ["ground beef"] })
    }
  })

  test("lets a skipped meal come round again", async () => {
    const fish = (
      await t.admin.post("/api/recipes", {
        name: "Fish Tacos",
        tags: ["dinner"],
        ingredients: ["1 lb cod"],
      })
    ).body.recipe
    const others = (await t.admin.get("/api/recipes")).body.recipes
      .map((r: { id: string }) => r.id)
      .filter((id: string) => id !== fish.id)
    const entry = (
      await t.admin.post("/api/plan/entries", {
        date: "2026-11-20",
        meal: "dinner",
        recipeId: fish.id,
      })
    ).body.entry
    const slot = [{ date: "2026-11-22", meal: "dinner" as const }]
    expect(
      await suggestMeals(t.db, householdId, slot, { exclude: others })
    ).toEqual([])
    await t.admin.patch(`/api/plan/entries/${entry.id}`, { status: "skipped" })
    const again = await suggestMeals(t.db, householdId, slot, {
      exclude: others,
    })
    expect(names(again)).toEqual(["Fish Tacos"])
  })
})
