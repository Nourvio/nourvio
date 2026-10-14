import { describe, expect, test } from "vitest"

import {
  avoidedIn,
  describeTastes,
  mergeTastes,
  missingDiets,
  NO_TASTES,
  type AvoidedFood,
} from "./tastes.ts"

const mushrooms: AvoidedFood = {
  food: "mushroom",
  who: "Jamie",
  allergy: false,
}
const nuts: AvoidedFood = { food: "nuts", who: "Sam", allergy: true }
const berries: AvoidedFood = { food: "berries", who: null, allergy: false }

describe("avoidedIn", () => {
  test("finds a food, singular or plural, as a whole word", () => {
    expect(avoidedIn(["8 oz cremini mushrooms, sliced"], [mushrooms])).toEqual([
      mushrooms,
    ])
    expect(avoidedIn(["1 cup mixed berry jam"], [berries])).toEqual([berries])
    expect(avoidedIn(["1 tbsp mushroomy umami paste"], [mushrooms])).toEqual([])
  })

  test("uses the careful diet check for foods a label covers", () => {
    // Pesto has pine nuts; butternut squash doesn't count.
    expect(avoidedIn(["2 tbsp basil pesto"], [nuts])).toEqual([nuts])
    expect(avoidedIn(["1 butternut squash"], [nuts])).toEqual([])
    // The recipe's own labels win when given (a corrected "nut-free").
    expect(avoidedIn(["2 tbsp basil pesto"], [nuts], ["nut-free"])).toEqual([])
  })

  test("is empty with nothing to avoid", () => {
    expect(avoidedIn(["1 onion"], [])).toEqual([])
  })
})

test("missingDiets lists required diets a recipe doesn't fit", () => {
  expect(missingDiets(["vegetarian"], ["vegetarian", "gluten-free"])).toEqual([
    "gluten-free",
  ])
})

test("describeTastes writes a short list for the assistant", () => {
  expect(describeTastes(NO_TASTES)).toBeNull()
  expect(
    describeTastes({
      avoid: [mushrooms, nuts],
      diets: ["vegetarian"],
      weeknightMinutes: 45,
      notes: ["No fish on Mondays"],
    })
  ).toBe(
    [
      "- Jamie doesn't eat mushroom",
      "- Allergy: nuts (Sam)",
      "- Every meal must be: vegetarian",
      "- Dinners Monday to Thursday: 45 minutes or less",
      "- No fish on Mondays",
    ].join("\n")
  )
})

test("mergeTastes adds without repeating, and an allergy upgrades a dislike", () => {
  const merged = mergeTastes(
    {
      ...NO_TASTES,
      avoid: [{ ...nuts, allergy: false }],
      notes: ["Mild food"],
    },
    {
      avoid: [nuts, mushrooms],
      notes: ["mild food", "No fish on Mondays"],
      diets: ["vegetarian"],
    }
  )
  expect(merged.avoid).toEqual([nuts, mushrooms])
  expect(merged.notes).toEqual(["Mild food", "No fish on Mondays"])
  expect(merged.diets).toEqual(["vegetarian"])
  expect(merged.weeknightMinutes).toBeNull()
})
