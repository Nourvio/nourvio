import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

describe("meal plan", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  let tacos: { id: string; slug: string }
  let salad: { id: string }

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
    tacos = (
      await t.admin.post("/api/recipes", {
        name: "Fish Tacos",
        servings: 4,
        totalMinutes: 30,
        ingredients: ["1 lb cod"],
        steps: ["Cook."],
      })
    ).body.recipe
    salad = (
      await t.admin.post("/api/recipes", {
        name: "Slaw",
        ingredients: ["1 cabbage"],
        steps: ["Shred."],
      })
    ).body.recipe
  })
  afterAll(() => t.close())

  test("plans recipes and notes into any meal", async () => {
    const dinner = await t.admin.post("/api/plan/entries", {
      date: "2026-10-14",
      meal: "dinner",
      recipeId: tacos.id,
      servings: 6,
    })
    expect(dinner.status).toBe(201)
    expect(dinner.body.entry).toMatchObject({
      date: "2026-10-14",
      meal: "dinner",
      position: 0,
      servings: 6,
      status: "planned",
      note: null,
      recipe: { name: "Fish Tacos", servings: 4, totalMinutes: 30 },
    })

    // A side with the same dinner goes after it.
    const side = await t.admin.post("/api/plan/entries", {
      date: "2026-10-14",
      meal: "dinner",
      recipeId: salad.id,
    })
    expect(side.body.entry.position).toBe(1)

    const note = await t.admin.post("/api/plan/entries", {
      date: "2026-10-15",
      meal: "lunch",
      note: "Leftovers",
    })
    expect(note.body.entry).toMatchObject({ note: "Leftovers", recipe: null })

    const neither = await t.admin.post("/api/plan/entries", {
      date: "2026-10-15",
      meal: "lunch",
    })
    expect(neither.status).toBe(400)
  })

  test("lists a date range in order", async () => {
    const res = await t.admin.get("/api/plan?from=2026-10-11&to=2026-10-17")
    expect(
      res.body.entries.map(
        (e: { recipe: { name: string } | null; note: string }) =>
          e.recipe?.name ?? e.note
      )
    ).toEqual(["Fish Tacos", "Slaw", "Leftovers"])
    expect((await t.admin.get("/api/plan?from=2026-10-11")).status).toBe(400)
    expect(
      (await t.admin.get("/api/plan?from=2026-01-01&to=2026-12-31")).status
    ).toBe(400)
  })

  test("moves, changes and skips entries", async () => {
    const [tacoEntry] = (
      await t.admin.get("/api/plan?from=2026-10-14&to=2026-10-14")
    ).body.entries
    const moved = await t.admin.patch(`/api/plan/entries/${tacoEntry.id}`, {
      date: "2026-10-16",
      servings: null,
    })
    expect(moved.body.entry).toMatchObject({
      date: "2026-10-16",
      servings: null,
      position: 0,
    })
    const skipped = await t.admin.patch(`/api/plan/entries/${tacoEntry.id}`, {
      status: "skipped",
    })
    expect(skipped.body.entry.status).toBe("skipped")

    // Cooking it records the recipe as made.
    await t.admin.patch(`/api/plan/entries/${tacoEntry.id}`, {
      status: "cooked",
    })
    const recipe = (await t.admin.get(`/api/recipes/${tacos.id}`)).body.recipe
    expect(recipe.lastMadeAt).not.toBeNull()
  })

  test("making a recipe checks off that day's planned meal", async () => {
    const entry = (
      await t.admin.post("/api/plan/entries", {
        date: "2026-10-20",
        meal: "dinner",
        recipeId: tacos.id,
      })
    ).body.entry
    await t.admin.post(`/api/recipes/${tacos.id}/made`, { date: "2026-10-20" })
    const [after] = (
      await t.admin.get("/api/plan?from=2026-10-20&to=2026-10-20")
    ).body.entries
    expect(after.id).toBe(entry.id)
    expect(after.status).toBe("cooked")
    // Without a date it still records the recipe as made.
    expect((await t.admin.post(`/api/recipes/${tacos.id}/made`)).status).toBe(
      200
    )
  })

  test("deleting a recipe takes it out of the plan", async () => {
    const temp = (
      await t.admin.post("/api/recipes", {
        name: "Temp",
        ingredients: ["1 egg"],
      })
    ).body.recipe
    await t.admin.post("/api/plan/entries", {
      date: "2026-10-21",
      meal: "breakfast",
      recipeId: temp.id,
    })
    await t.admin.delete(`/api/recipes/${temp.id}`)
    const res = await t.admin.get("/api/plan?from=2026-10-21&to=2026-10-21")
    expect(res.body.entries).toEqual([])
  })

  test("removes entries", async () => {
    const entry = (
      await t.admin.post("/api/plan/entries", {
        date: "2026-10-22",
        meal: "dinner",
        note: "Eating out",
      })
    ).body.entry
    expect((await t.admin.delete(`/api/plan/entries/${entry.id}`)).status).toBe(
      204
    )
    expect((await t.admin.delete(`/api/plan/entries/${entry.id}`)).status).toBe(
      404
    )
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
    const [entry] = (
      await t.admin.get("/api/plan?from=2026-10-15&to=2026-10-15")
    ).body.entries
    expect(
      (await other.get("/api/plan?from=2026-10-11&to=2026-10-17")).body.entries
    ).toEqual([])
    expect(
      (
        await other.patch(`/api/plan/entries/${entry.id}`, {
          status: "skipped",
        })
      ).status
    ).toBe(404)
    expect((await other.delete(`/api/plan/entries/${entry.id}`)).status).toBe(
      404
    )
    expect(
      (
        await other.post("/api/plan/entries", {
          date: "2026-10-15",
          meal: "dinner",
          recipeId: tacos.id,
        })
      ).status
    ).toBe(404)
  })

  test("the household picks its meals and first day of the week", async () => {
    const before = (await t.admin.get("/api/household")).body.household
    expect(before).toMatchObject({
      meals: ["breakfast", "lunch", "dinner"],
      weekStart: 0,
    })
    const res = await t.admin.patch("/api/household", {
      meals: ["dinner", "breakfast"],
      weekStart: 1,
    })
    expect(res.body.household).toMatchObject({
      meals: ["breakfast", "dinner"],
      weekStart: 1,
    })
    expect((await t.admin.patch("/api/household", { meals: [] })).status).toBe(
      400
    )
  })
})
