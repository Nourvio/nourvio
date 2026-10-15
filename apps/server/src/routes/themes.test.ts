import {
  addDays,
  toIsoDate,
  weekdayOf,
  type Household,
  type MealSuggestion,
  type WeekThemes,
} from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createTestAppWithAdmin } from "../test/helpers.ts"

describe("theme nights", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  // Next week, Monday to Friday.
  let monday = toIsoDate(new Date())
  while (weekdayOf(monday) !== 1) monday = addDays(monday, 1)
  const night = (weekday: number) => addDays(monday, weekday - 1)

  const themes: WeekThemes = [
    null,
    { kind: "tag", name: "Pizza", tag: "pizza" },
    { kind: "tag", name: "Tacos", tag: "taco" },
    { kind: "fish", name: "Fish" },
    null,
    { kind: "skip", name: "Eat out" },
    null,
  ]

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
    for (const recipe of [
      {
        name: "Chicken Tacos",
        ingredients: ["1 lb chicken thighs", "8 tortillas"],
      },
      { name: "Salmon Bowl", ingredients: ["1 lb salmon", "1 cup rice"] },
      { name: "Pesto Pasta", ingredients: ["1 lb pasta", "1/2 cup pesto"] },
      { name: "Lentil Soup", ingredients: ["1 cup lentils", "2 carrots"] },
      { name: "Beef Chili", ingredients: ["1 lb ground beef", "1 can beans"] },
    ]) {
      await t.admin.post("/api/recipes", recipe)
    }
  })
  afterAll(() => t.close())

  test("the household sets a theme for each night", async () => {
    const res = await t.admin.patch("/api/household", { themes })
    expect(res.status).toBe(200)
    expect((res.body.household as Household).themes[2]).toEqual({
      kind: "tag",
      name: "Tacos",
      tag: "taco",
    })
    expect(
      (await t.admin.patch("/api/household", { themes: themes.slice(1) }))
        .status
    ).toBe(400)
  })

  test("dinners fit the night's theme, and eat-out nights stay empty", async () => {
    const slots = [1, 2, 3, 4, 5].map((weekday) => ({
      date: night(weekday),
      meal: "dinner",
    }))
    const suggestions = (await t.admin.post("/api/plan/suggest", { slots }))
      .body.suggestions as MealSuggestion[]
    const on = (weekday: number) =>
      suggestions.find((s) => s.date === night(weekday))

    expect(on(2)).toMatchObject({
      recipe: { name: "Chicken Tacos" },
      theme: { name: "Taco night", fits: true },
    })
    expect(on(3)).toMatchObject({
      recipe: { name: "Salmon Bowl" },
      theme: { name: "Fish night", fits: true },
    })
    // Nothing is pizza, so the usual suggestion, saying so.
    expect(on(1)?.theme).toEqual({ name: "Pizza night", fits: false })
    expect(on(4)?.theme).toBeNull()
    expect(on(5)).toBeUndefined()

    // Lunch has no themes.
    const lunch = (
      await t.admin.post("/api/plan/suggest", {
        slots: [{ date: night(5), meal: "lunch" }],
      })
    ).body.suggestions as MealSuggestion[]
    expect(lunch.every((s) => s.theme === null)).toBe(true)
  })
})
