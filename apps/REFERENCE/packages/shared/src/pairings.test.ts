import { describe, expect, test } from "vitest"

import { pairedRecipeInput, pairingFactor, pairRecipes } from "./pairings.ts"
import type { Nutrition, Recipe } from "./recipes.ts"

const nutrition = (calories: number, protein: number): Nutrition => ({
  calories,
  protein,
  fat: null,
  saturatedFat: null,
  carbohydrates: null,
  fiber: null,
  sugar: null,
  sodium: null,
  cholesterol: null,
  source: "calculated",
})

const part = (
  name: string,
  servings: number | null,
  lines: string[],
  extra: Partial<Recipe> = {}
) =>
  ({
    id: name,
    name,
    servings,
    totalMinutes: null,
    tags: [],
    diets: [],
    nutrition: null,
    ingredients: lines.map((text, i) => ({
      id: `${name}-i${i}`,
      section: null,
      text,
      quantity: null,
      quantityMax: null,
      unitId: null,
      food: null,
      note: null,
      unitGrams: null,
    })),
    steps: [{ id: `${name}-s0`, section: null, text: `Make the ${name}.` }],
    ...extra,
  }) as Recipe

const chicken = part("Chicken + Rice", 4, ["1 lb chicken", "1 cup rice"], {
  totalMinutes: 40,
  diets: ["gluten-free", "dairy-free"],
  nutrition: nutrition(500, 40),
  tags: ["dinner"],
})
const sauce = part("Teriyaki Sauce", 8, ["1/2 cup soy sauce", "2 tbsp honey"], {
  totalMinutes: 10,
  diets: ["dairy-free", "vegetarian"],
  nutrition: nutrition(60, 1),
})

describe("pairingFactor", () => {
  test("matches servings when both say, else a batch per batch", () => {
    expect(pairingFactor(chicken, sauce)).toBe(0.5)
    expect(pairingFactor(chicken, sauce, 2)).toBe(1)
    expect(pairingFactor(chicken, { ...sauce, servings: null }, 2)).toBe(2)
  })
})

describe("pairRecipes", () => {
  test("puts the pairing first, each part under its own heading", () => {
    const paired = pairRecipes(chicken, sauce)
    expect(paired.name).toBe("Chicken + Rice with Teriyaki Sauce")
    expect(paired.ingredients.map((i) => i.section)).toEqual([
      "Teriyaki Sauce",
      "Teriyaki Sauce",
      "Chicken + Rice",
      "Chicken + Rice",
    ])
    expect(paired.steps.map((s) => s.section)).toEqual([
      "Teriyaki Sauce",
      "Chicken + Rice",
    ])
    expect(paired.factors.get("Teriyaki Sauce-i0")).toBe(0.5)
    expect(paired.factors.get("Chicken + Rice-i0")).toBe(1)
    expect(paired.totalMinutes).toBe(50)
  })

  test("adds up nutrition per serving and keeps shared diet labels", () => {
    const paired = pairRecipes(chicken, sauce)
    expect(paired.nutrition).toMatchObject({
      calories: 560,
      protein: 41,
      fat: null,
      source: "calculated",
    })
    expect(paired.diets).toEqual(["dairy-free"])
    expect(
      pairRecipes(chicken, { ...sauce, nutrition: null }).nutrition
    ).toBeNull()
  })
})

describe("pairedRecipeInput", () => {
  test("writes the pairing out as one recipe, scaled", () => {
    expect(pairedRecipeInput(chicken, sauce)).toEqual({
      name: "Chicken + Rice with Teriyaki Sauce",
      servings: 4,
      totalMinutes: 50,
      tags: ["dinner"],
      ingredients: [
        "# Teriyaki Sauce",
        "¼ cup soy sauce",
        "1 tbsp honey",
        "# Chicken + Rice",
        "1 lb chicken",
        "1 cup rice",
      ],
      steps: [
        "# Teriyaki Sauce",
        "Make the Teriyaki Sauce.",
        "# Chicken + Rice",
        "Make the Chicken + Rice.",
      ],
    })
  })
})
