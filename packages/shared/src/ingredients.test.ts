import { describe, expect, test } from "vitest"

import {
  formatQuantity,
  joinSections,
  normalizeIngredientLine,
  parseIngredient,
  scaleIngredient,
  splitSections,
} from "./ingredients.ts"

describe("parseIngredient", () => {
  test.each([
    [
      "2 cups all-purpose flour, sifted",
      2,
      null,
      "cup",
      "all-purpose flour",
      "sifted",
    ],
    ["1 1/2 tsp salt", 1.5, null, "teaspoon", "salt", null],
    ["1½ cups milk", 1.5, null, "cup", "milk", null],
    ["½ cup sugar", 0.5, null, "cup", "sugar", null],
    ["2-3 cloves garlic, minced", 2, 3, "clove", "garlic", "minced"],
    ["2 to 3 tbsp olive oil", 2, 3, "tablespoon", "olive oil", null],
    [
      "1 (14.5 oz) can diced tomatoes",
      1,
      null,
      "can",
      "diced tomatoes",
      "14.5 oz",
    ],
    ["200g butter, softened", 200, null, "gram", "butter", "softened"],
    ["1 lb. ground beef", 1, null, "pound", "ground beef", null],
    ["3 large eggs", 3, null, null, "large eggs", null],
    ["1 T soy sauce", 1, null, "tablespoon", "soy sauce", null],
    ["1 t vanilla extract", 1, null, "teaspoon", "vanilla extract", null],
    ["8 fl oz chicken stock", 8, null, "fluid-ounce", "chicken stock", null],
    ["a pinch of salt", 1, null, "pinch", "salt", null],
    [
      "2 sprigs fresh thyme (optional)",
      2,
      null,
      "sprig",
      "fresh thyme",
      "optional",
    ],
    ["1,5 l water", 1.5, null, "liter", "water", null],
    ["- 1 cup rice", 1, null, "cup", "rice", null],
    ["▢ 2 tablespoons butter", 2, null, "tablespoon", "butter", null],
  ])("%s", (line, quantity, quantityMax, unitId, food, note) => {
    const parsed = parseIngredient(line)
    expect(parsed.quantity).toBeCloseTo(quantity)
    expect(parsed.quantityMax).toBe(quantityMax)
    expect(parsed.unitId).toBe(unitId)
    expect(parsed.food).toBe(food)
    expect(parsed.note).toBe(note)
  })

  test("lines without an amount keep their text as the food", () => {
    expect(parseIngredient("Salt and pepper, to taste")).toMatchObject({
      quantity: null,
      unitId: null,
      food: "Salt and pepper",
      note: "to taste",
    })
    expect(parseIngredient("a few basil leaves").quantity).toBeNull()
  })

  test("the parts put back together give the original text", () => {
    for (const line of [
      "1 (14.5 oz) can diced tomatoes",
      "2 cups flour",
      "a pinch of salt",
      "3 eggs",
    ]) {
      const { text, parts } = parseIngredient(line)
      expect(
        parts && parts.quantity + parts.between + parts.unit + parts.rest
      ).toBe(text)
    }
  })
})

describe("normalizeIngredientLine", () => {
  test("spells out unicode fractions and drops bullets", () => {
    expect(normalizeIngredientLine("•  1¾  cups   flour")).toBe(
      "1 3/4 cups flour"
    )
  })
})

describe("formatQuantity", () => {
  test.each([
    [1.5, "1 ½"],
    [0.25, "¼"],
    [1 / 3, "⅓"],
    [2, "2"],
    [0.999, "1"],
    [2.4, "2 ⅜"],
    [24.4, "24"],
    [0.05, "0.05"],
  ])("%s → %s", (value, expected) => {
    expect(formatQuantity(value)).toBe(expected)
  })

  test("metric amounts stay decimal", () => {
    expect(formatQuantity(1.5, { metric: true })).toBe("1.5")
    expect(formatQuantity(2.4, { metric: true })).toBe("2.4")
    expect(formatQuantity(312.5, { metric: true })).toBe("313")
  })
})

describe("scaleIngredient", () => {
  test("multiplies the amount and keeps the rest of the line", () => {
    expect(scaleIngredient("1 cup flour, sifted", 2)).toBe(
      "2 cups flour, sifted"
    )
    expect(scaleIngredient("2 cups milk", 0.5)).toBe("1 cup milk")
    expect(scaleIngredient("1 1/2 tsp salt", 2)).toBe("3 tsp salt")
    expect(scaleIngredient("2-3 cloves garlic", 2)).toBe("4–6 cloves garlic")
    expect(scaleIngredient("1 (14.5 oz) can tomatoes", 2)).toBe(
      "2 (14.5 oz) cans tomatoes"
    )
    expect(scaleIngredient("250 g butter", 1.5)).toBe("375 g butter")
    expect(scaleIngredient("a pinch of salt", 2)).toBe("2 pinches of salt")
  })

  test("leaves lines without an amount alone", () => {
    expect(scaleIngredient("Salt to taste", 3)).toBe("Salt to taste")
  })

  test("writes amounts the kitchen way even when not scaled", () => {
    expect(scaleIngredient("1 1/2 lb chicken thighs", 1)).toBe(
      "1 ½ lb chicken thighs"
    )
    expect(scaleIngredient("2-3 cloves garlic", 1)).toBe("2–3 cloves garlic")
    expect(scaleIngredient("1.5 l water", 1)).toBe("1.5 l water")
    expect(scaleIngredient("a pinch of salt", 1)).toBe("a pinch of salt")
  })
})

describe("sections", () => {
  test("splits on # headings and joins back", () => {
    const lines = [
      "# Dough",
      "2 cups flour",
      "1 cup water",
      "# Filling",
      "1 apple",
    ]
    const items = splitSections(lines)
    expect(items).toEqual([
      { section: "Dough", text: "2 cups flour" },
      { section: "Dough", text: "1 cup water" },
      { section: "Filling", text: "1 apple" },
    ])
    expect(joinSections(items)).toEqual(lines)
  })

  test("optionally treats 'For the sauce:' lines as headings", () => {
    const items = splitSections(["For the sauce:", "1 cup cream"], {
      colonHeadings: true,
    })
    expect(items).toEqual([{ section: "For the sauce", text: "1 cup cream" }])
  })
})
