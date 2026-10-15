import { describe, expect, test } from "vitest"

import {
  addAmounts,
  combineLines,
  foodKey,
  formatAmount,
  guessSection,
  subtractAmounts,
} from "./grocery.ts"

const line = (text: string, source = "Recipe", factor = 1) => ({
  text,
  source,
  factor,
})

describe("foodKey", () => {
  test.each([
    ["Onions", "onion"],
    ["2 large onions", "2 onion"],
    ["large eggs", "egg"],
    ["tomatoes", "tomato"],
    ["fresh berries", "berry"],
    ["chickpeas", "chickpea"],
    ["asparagus", "asparagus"],
    ["boneless chicken thighs", "boneless chicken thigh"],
  ])("%s → %s", (food, key) => {
    expect(foodKey(food)).toBe(key)
  })
})

describe("combineLines", () => {
  test("adds up the same food across recipes", () => {
    const items = combineLines([
      line("1 onion, diced", "Chili"),
      line("2 large onions", "Soup"),
      line("3 cloves garlic", "Chili"),
      line("2-3 cloves garlic, minced", "Soup"),
    ])
    expect(items).toEqual([
      {
        key: "onion|each",
        name: "onion",
        quantity: 3,
        unitId: null,
        sources: ["Chili", "Soup"],
        entries: [],
      },
      {
        key: "garlic|clove",
        name: "garlic",
        quantity: 6,
        unitId: "clove",
        sources: ["Chili", "Soup"],
        entries: [],
      },
    ])
  })

  test("converts volumes and weights, showing the biggest unit used", () => {
    const [butter, beef] = combineLines([
      line("2 tbsp butter"),
      line("½ cup butter"),
      line("1 lb ground beef"),
      line("8 oz ground beef"),
    ])
    expect(butter).toMatchObject({ unitId: "cup", quantity: 0.625 })
    expect(formatAmount(butter!.quantity, butter!.unitId)).toBe("⅝ cup")
    expect(beef).toMatchObject({ unitId: "pound", quantity: 1.5 })
  })

  test("scales by the planned servings", () => {
    const [milk] = combineLines([line("1 cup milk", "Pancakes", 1.5)])
    expect(milk).toMatchObject({ quantity: 1.5, unitId: "cup" })
  })

  test("keeps counts and weights of the same food apart", () => {
    const items = combineLines([
      line("1 (14.5 oz) can diced tomatoes"),
      line("2 cans diced tomatoes"),
      line("1 lb tomatoes"),
    ])
    expect(items.map((i) => [i.key, i.quantity])).toEqual([
      ["diced tomato|can", 3],
      ["tomato|weight", 1],
    ])
  })

  test("lists 'to taste' lines once, folded into an amount if there is one", () => {
    const items = combineLines([
      line("Salt to taste", "A"),
      line("salt, to taste", "B"),
      line("olive oil, for drizzling", "A"),
      line("2 tbsp olive oil", "B"),
    ])
    expect(items).toEqual([
      {
        key: "salt|none",
        name: "Salt",
        quantity: null,
        unitId: null,
        sources: ["A", "B"],
        entries: [],
      },
      {
        key: "olive oil|volume",
        name: "olive oil",
        quantity: 2,
        unitId: "tablespoon",
        sources: ["B", "A"],
        entries: [],
      },
    ])
  })
})

describe("guessSection", () => {
  test.each([
    ["onion", "produce"],
    ["green onions", "produce"],
    ["strawberries", "produce"],
    ["chicken thighs", "meat-seafood"],
    ["ground beef", "meat-seafood"],
    ["ground cumin", "spices"],
    ["buttermilk", "dairy-eggs"],
    ["eggs", "dairy-eggs"],
    ["frozen peas", "frozen"],
    ["canned black beans", "canned-jarred"],
    ["smoked paprika", "spices"],
    ["all-purpose flour", "pantry"],
    ["Diet Pepsi", "beverages"],
    ["paper towels", "household"],
    ["soy sauce", "condiments"],
    ["chicken stock", "canned-jarred"],
    ["crushed tomatoes", "canned-jarred"],
    ["coconut milk", "canned-jarred"],
    ["black beans", "canned-jarred"],
    ["green beans", "produce"],
    ["peanut butter", "condiments"],
    ["butter", "dairy-eggs"],
    ["mystery item", "other"],
  ])("%s → %s", (name, section) => {
    expect(guessSection(name)).toBe(section)
  })

  test("anything by the can or jar is canned", () => {
    expect(guessSection("tomatoes", "can")).toBe("canned-jarred")
    expect(guessSection("artichoke hearts", "jar")).toBe("canned-jarred")
  })
})

describe("formatAmount", () => {
  test.each([
    [3, null, "3"],
    [1.5, "pound", "1 ½ lb"],
    [2, "can", "2 cans"],
    [1, "clove", "1 clove"],
    [500, "gram", "500 g"],
    [null, null, ""],
  ])("%s %s → %s", (quantity, unit, text) => {
    expect(formatAmount(quantity, unit)).toBe(text)
  })
})

describe("addAmounts", () => {
  test("adds what can be added, and refuses the rest", () => {
    expect(
      addAmounts(
        { quantity: 1, unitId: "cup" },
        { quantity: 4, unitId: "tablespoon" }
      )
    ).toEqual({
      quantity: 1.25,
      unitId: "cup",
    })
    expect(
      addAmounts({ quantity: 2, unitId: null }, { quantity: 1, unitId: null })
    ).toEqual({
      quantity: 3,
      unitId: null,
    })
    expect(
      addAmounts(
        { quantity: 1, unitId: "can" },
        { quantity: 1, unitId: "pound" }
      )
    ).toBeNull()
    expect(
      addAmounts(
        { quantity: null, unitId: null },
        { quantity: null, unitId: null }
      )
    ).toEqual({
      quantity: null,
      unitId: null,
    })
  })
})

describe("subtractAmounts", () => {
  test("takes the same unit, or converts volumes and weights", () => {
    expect(
      subtractAmounts(
        { quantity: 3, unitId: "pound" },
        { quantity: 1, unitId: "pound" }
      )
    ).toEqual({ quantity: 2, unitId: "pound" })
    expect(
      subtractAmounts(
        { quantity: 1, unitId: "cup" },
        { quantity: 4, unitId: "tablespoon" }
      )
    ).toEqual({ quantity: 0.75, unitId: "cup" })
    expect(
      subtractAmounts(
        { quantity: 2, unitId: null },
        { quantity: 3, unitId: null }
      )
    ).toEqual({ quantity: -1, unitId: null })
  })

  test("can't compare counts in different units, or no amount", () => {
    expect(
      subtractAmounts(
        { quantity: 1, unitId: "can" },
        { quantity: 1, unitId: "cup" }
      )
    ).toBeNull()
    expect(
      subtractAmounts(
        { quantity: null, unitId: null },
        { quantity: 1, unitId: null }
      )
    ).toBeNull()
  })
})
