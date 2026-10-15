import { describe, expect, it } from "vitest"

import {
  fitsTheme,
  themeLabel,
  weekThemesSchema,
  type ThemeRecipe,
} from "./themes.ts"

const recipe = (over: Partial<ThemeRecipe>): ThemeRecipe => ({
  name: "Dinner",
  tags: [],
  diets: [],
  totalMinutes: 45,
  lastMadeAt: "2026-09-01T00:00:00Z",
  lines: [],
  ...over,
})

describe("fitsTheme", () => {
  it("matches a tag theme by tag or name, singular or plural", () => {
    const tacos = { kind: "tag", name: "Tacos", tag: "taco" } as const
    expect(fitsTheme(recipe({ name: "Chicken Tacos" }), tacos)).toBe(true)
    expect(fitsTheme(recipe({ tags: ["Tacos"] }), tacos)).toBe(true)
    expect(fitsTheme(recipe({ name: "Tacoma Chili" }), tacos)).toBe(false)
    const stirFry = { kind: "tag", name: "Stir-fry", tag: "stir fry" } as const
    expect(fitsTheme(recipe({ name: "Beef Stir-Fry" }), stirFry)).toBe(true)
  })

  it("knows meatless, fish, new and quick", () => {
    expect(
      fitsTheme(recipe({ diets: ["vegetarian"] }), {
        kind: "meatless",
        name: "Meatless",
      })
    ).toBe(true)
    expect(fitsTheme(recipe({}), { kind: "meatless", name: "Meatless" })).toBe(
      false
    )
    expect(
      fitsTheme(recipe({ lines: ["1 lb salmon fillets"] }), {
        kind: "fish",
        name: "Fish",
      })
    ).toBe(true)
    expect(
      fitsTheme(recipe({ lines: ["2 lb chicken thighs"] }), {
        kind: "fish",
        name: "Fish",
      })
    ).toBe(false)
    expect(
      fitsTheme(recipe({ lastMadeAt: null }), {
        kind: "new",
        name: "Something new",
      })
    ).toBe(true)
    expect(
      fitsTheme(recipe({ totalMinutes: 25 }), {
        kind: "quick",
        name: "Something quick",
      })
    ).toBe(true)
    expect(
      fitsTheme(recipe({ totalMinutes: null }), {
        kind: "quick",
        name: "Something quick",
      })
    ).toBe(false)
    expect(fitsTheme(recipe({}), { kind: "skip", name: "Eat out" })).toBe(false)
  })
})

describe("themeLabel", () => {
  it("names the night", () => {
    expect(themeLabel({ kind: "tag", name: "Tacos", tag: "taco" })).toBe(
      "Taco night"
    )
    expect(themeLabel({ kind: "fish", name: "Fish" })).toBe("Fish night")
    expect(themeLabel({ kind: "new", name: "Something new" })).toBe(
      "Something new"
    )
    expect(themeLabel({ kind: "skip", name: "Eat out" })).toBe("Eat out")
  })
})

describe("weekThemesSchema", () => {
  it("takes seven nights, and a tag theme needs its tag", () => {
    const week = [
      null,
      null,
      { kind: "tag", name: "Tacos", tag: "taco" },
      null,
      null,
      null,
      null,
    ]
    expect(weekThemesSchema.safeParse(week).success).toBe(true)
    expect(weekThemesSchema.safeParse(week.slice(1)).success).toBe(false)
    week[2] = { kind: "tag", name: "Tacos" } as never
    expect(weekThemesSchema.safeParse(week).success).toBe(false)
  })
})
