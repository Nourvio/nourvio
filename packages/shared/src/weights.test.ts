import { describe, expect, test } from "vitest"

import { formatIngredient } from "./ingredients.ts"
import { bakingDensity, formatGrams } from "./weights.ts"

const perCup = (food: string) => {
  const density = bakingDensity(food)
  return density === null ? null : Math.round(density * 236.588)
}

describe("bakingDensity", () => {
  test.each([
    ["all-purpose flour", 120],
    ["unbleached all-purpose flour", 120],
    ["whole wheat flour", 113],
    ["almond flour", 96],
    ["granulated sugar", 198],
    ["packed light brown sugar", 213],
    ["powdered sugar", 113],
    ["unsalted butter", 227],
    ["creamy peanut butter", 270],
    ["whole milk", 242],
    ["heavy cream", 238],
    ["cream cheese", 232],
    ["kosher salt", 135],
    ["Morton kosher salt", 230],
    ["baking soda", 288],
    ["semisweet chocolate chips", 170],
    ["old-fashioned rolled oats", 90],
  ])("%s weighs %i g a cup", (food, grams) => {
    expect(perCup(food)).toBe(grams)
  })

  test("leaves alone what it doesn't know, or what's been changed", () => {
    expect(bakingDensity("chopped onion")).toBeNull()
    expect(bakingDensity("cooked rice")).toBeNull()
    expect(bakingDensity("melted butter")).toBeNull()
  })
})

describe("formatGrams", () => {
  test.each([
    [0.2, "0.5 g"],
    [2.8, "3 g"],
    [6.2, "6 g"],
    [44.6, "45 g"],
    [148.5, "149 g"],
    [270, "270 g"],
    [1012, "1012 g"],
  ])("%d → %s", (grams, text) => {
    expect(formatGrams(grams)).toBe(text)
  })
})

describe("formatIngredient in grams", () => {
  test("swaps the amount and unit for grams, scaled", () => {
    expect(formatIngredient("2 1/4 cups all-purpose flour", 1, 120)).toEqual({
      amount: "270 g",
      rest: " all-purpose flour",
    })
    expect(
      formatIngredient("2 1/4 cups all-purpose flour", 2, 120).amount
    ).toBe("540 g")
    expect(formatIngredient("1 (15 oz) can pumpkin", 1, 425.24)).toEqual({
      amount: "425 g",
      rest: " pumpkin",
    })
  })

  test("drops the other measures a line gives", () => {
    expect(
      formatIngredient(
        "1½ cups plus 1 Tbsp. (200 g) all-purpose flour (spooned)",
        1,
        200 / 1.5
      )
    ).toEqual({ amount: "200 g", rest: " all-purpose flour (spooned)" })
    expect(
      formatIngredient(
        "¾ cup (1½ sticks; 169 g) unsalted butter",
        2,
        169 / 0.75
      )
    ).toEqual({ amount: "338 g", rest: " unsalted butter" })
    expect(
      formatIngredient("1 cup plus 2 tbsp all-purpose flour", 1, 135)
    ).toEqual({ amount: "135 g", rest: " all-purpose flour" })
    expect(formatIngredient("1 (400 g) can tomatoes", 1, 400)).toEqual({
      amount: "400 g",
      rest: " tomatoes",
    })
  })

  test("keeps ranges, and lines without an amount", () => {
    expect(formatIngredient("2-3 tbsp olive oil", 1, 13.6).amount).toBe(
      "27–41 g"
    )
    expect(formatIngredient("Salt to taste", 1, 6).amount).toBe("")
  })
})
