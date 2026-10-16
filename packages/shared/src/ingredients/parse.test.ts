import { describe, expect, test } from "vitest"
import {
  normalizeIngredientLine,
  parseIngredient,
  plusAmount,
  statedGrams,
} from "./parse.ts"

describe("reading an ingredient line", () => {
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

  test("a line without an amount is all food", () => {
    expect(parseIngredient("Salt and pepper, to taste")).toMatchObject({
      quantity: null,
      unitId: null,
      food: "Salt and pepper",
      note: "to taste",
    })
    expect(parseIngredient("a few basil leaves").quantity).toBeNull()
  })

  test("its parts put back together are the line", () => {
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

  test("describing words before a comma stay with the food", () => {
    expect(
      parseIngredient(
        "1 1/2 pounds skinless, boneless chicken thighs, cut into 1 1/2-inch pieces"
      )
    ).toMatchObject({
      quantity: 1.5,
      unitId: "pound",
      food: "skinless boneless chicken thighs",
      note: "cut into 1 1/2-inch pieces",
    })
    expect(parseIngredient("2 large, ripe avocados, halved")).toMatchObject({
      food: "large ripe avocados",
      note: "halved",
    })
    expect(parseIngredient("1 onion, diced")).toMatchObject({
      food: "onion",
      note: "diced",
    })
    expect(parseIngredient("4 cups vegetable oil, for frying")).toMatchObject({
      food: "vegetable oil",
      note: "for frying",
    })
  })
})

test("lines are tidied: fractions spelled out, bullets gone", () => {
  expect(normalizeIngredientLine("•  1¾  cups   flour")).toBe(
    "1 3/4 cups flour"
  )
})

test("a line's own weight in grams is found", () => {
  expect(statedGrams("1½ cups plus 1 Tbsp. (200 g) flour")).toMatchObject({
    grams: 200,
  })
  expect(statedGrams("1½ sticks (1½ sticks; 169 g) butter")?.grams).toBe(169)
  expect(statedGrams("2 cups flour")).toBeNull()
})

test("an extra amount after 'plus' is found", () => {
  expect(plusAmount(" plus 1 Tbsp. flour")).toEqual({
    quantity: 1,
    unitId: "tablespoon",
    length: 13,
  })
  expect(plusAmount(" flour")).toBeNull()
})
