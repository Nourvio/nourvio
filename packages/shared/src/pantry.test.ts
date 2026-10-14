import { describe, expect, test } from "vitest"

import {
  guessUseBy,
  pantryKey,
  sameFood,
  whyUseSoon,
  type PantryMeal,
} from "./pantry.ts"

describe("sameFood", () => {
  test.each([
    ["chicken thighs", "boneless skinless chicken thighs"],
    ["onions", "yellow onion"],
    ["olive oil", "extra-virgin olive oil"],
    ["butter", "unsalted butter"],
    ["cheddar cheese", "shredded cheddar cheese"],
    ["bay leaf", "bay leaves"],
    ["Eggs", "large eggs"],
  ])("%s covers %s", (have, need) => {
    expect(sameFood(have, need)).toBe(true)
  })

  test.each([
    ["cheese", "cream cheese"],
    ["butter", "peanut butter"],
    ["pepper", "bell pepper"],
    ["milk", "coconut milk"],
    ["onion", "red onion"],
    ["beef", "ground beef"],
  ])("%s doesn't cover %s", (have, need) => {
    expect(sameFood(have, need)).toBe(false)
  })

  test("keeps a name that's only a prep word", () => {
    expect(pantryKey("Diced")).toBe("diced")
  })
})

describe("guessUseBy", () => {
  test("guesses for fresh food only", () => {
    expect(guessUseBy("ground beef", "meat-seafood", "2026-10-14")).toBe(
      "2026-10-17"
    )
    expect(guessUseBy("spinach", "produce", "2026-10-14")).toBe("2026-10-21")
    expect(guessUseBy("onions", "produce", "2026-10-14")).toBeNull()
    expect(guessUseBy("rice", "pantry", "2026-10-14")).toBeNull()
  })
})

describe("whyUseSoon", () => {
  const meal = (date: string, status: PantryMeal["status"]): PantryMeal => ({
    id: date,
    date,
    meal: "dinner",
    name: "Tacos",
    status,
  })

  test("flags food near or past its use-by date", () => {
    expect(
      whyUseSoon({ useBy: "2026-10-16", meals: [] }, "2026-10-14")
    ).toEqual({
      kind: "soon",
      date: "2026-10-16",
    })
    expect(
      whyUseSoon({ useBy: "2026-10-13", meals: [] }, "2026-10-14")
    ).toEqual({
      kind: "past",
      date: "2026-10-13",
    })
    expect(
      whyUseSoon({ useBy: "2026-10-20", meals: [] }, "2026-10-14")
    ).toBeNull()
  })

  test("flags food bought for meals that were skipped or went by", () => {
    const skipped = meal("2026-10-15", "skipped")
    const missed = meal("2026-10-12", "planned")
    expect(whyUseSoon({ useBy: null, meals: [skipped] }, "2026-10-14")).toEqual(
      {
        kind: "leftover",
        meals: [skipped],
      }
    )
    expect(whyUseSoon({ useBy: null, meals: [missed] }, "2026-10-14")).toEqual({
      kind: "leftover",
      meals: [missed],
    })
    // Still wanted for an upcoming meal, or cooked: nothing to flag.
    expect(
      whyUseSoon(
        { useBy: null, meals: [skipped, meal("2026-10-16", "planned")] },
        "2026-10-14"
      )
    ).toBeNull()
    expect(
      whyUseSoon(
        { useBy: null, meals: [meal("2026-10-12", "cooked")] },
        "2026-10-14"
      )
    ).toBeNull()
  })
})
