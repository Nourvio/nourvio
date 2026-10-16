import { describe, expect, test } from "vitest"
import { avoidedIn, missingDiets } from "./tastes.ts"

const mushroom = { food: "mushroom", allergy: false }
const nuts = { food: "nuts", allergy: true }

describe("avoided foods", () => {
  test("match a food in its other forms", () => {
    expect(avoidedIn(["8 oz mushrooms, sliced"], [mushroom])).toEqual([
      mushroom,
    ])
    const berry = { food: "berry", allergy: false }
    expect(avoidedIn(["1 cup mixed berries"], [berry])).toEqual([berry])
    expect(avoidedIn(["2 cups rice"], [mushroom])).toEqual([])
  })

  test("match whole words only", () => {
    const pea = { food: "pea", allergy: false }
    expect(avoidedIn(["1 peach, sliced"], [pea])).toEqual([])
    expect(avoidedIn(["1 cup frozen peas"], [pea])).toEqual([pea])
  })

  test("use the diet labels' careful check for nuts, dairy and the like", () => {
    // Pesto has nuts, though the word isn't there.
    expect(avoidedIn(["1/2 cup pesto"], [nuts])).toEqual([nuts])
    const dairy = { food: "Dairy", allergy: false }
    expect(avoidedIn(["2 tbsp butter"], [dairy])).toEqual([dairy])
    expect(avoidedIn(["2 tbsp olive oil"], [dairy])).toEqual([])
  })

  test("trust the recipe's labels when given, corrections and all", () => {
    expect(avoidedIn(["1/2 cup pesto"], [nuts], ["nut-free"])).toEqual([])
  })

  test("are none when there's nothing to avoid or no ingredients", () => {
    expect(avoidedIn(["1 cup pesto"], [])).toEqual([])
    expect(avoidedIn([], [nuts])).toEqual([])
  })
})

describe("diets every meal must fit", () => {
  test("say which a recipe misses", () => {
    expect(missingDiets(["vegetarian"], ["vegetarian", "nut-free"])).toEqual([
      "nut-free",
    ])
    expect(missingDiets(["vegan", "vegetarian"], ["vegetarian"])).toEqual([])
    expect(missingDiets([], [])).toEqual([])
  })
})
