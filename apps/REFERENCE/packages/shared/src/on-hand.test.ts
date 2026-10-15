import { describe, expect, test } from "vitest"

import { onHandKeys, onHandTest, tidyOnHand } from "./on-hand.ts"

describe("onHandKeys", () => {
  test.each([
    ["salt", ["salt"]],
    ["Kosher salt", ["salt"]],
    ["coarse sea salt", ["salt"]],
    ["black pepper", ["pepper"]],
    ["freshly ground black pepper", ["pepper"]],
    ["fresh cracked pepper", ["pepper"]],
    ["salt and pepper", ["salt", "pepper"]],
    ["Salt & Pepper", ["salt", "pepper"]],
    ["ice cubes", ["ice"]],
    ["warm water", ["water"]],
    ["olive oil", ["olive oil"]],
  ])("%s", (name, keys) => {
    expect(onHandKeys(name)).toEqual(keys)
  })

  test("keeps other peppers apart", () => {
    for (const name of ["bell pepper", "white pepper", "red pepper flakes"]) {
      expect(onHandKeys(name)).not.toEqual(["pepper"])
    }
  })

  test("only splits combinations of basics", () => {
    expect(onHandKeys("half and half")).toEqual(["half and half"])
    expect(onHandKeys("salt and vinegar chips")).toHaveLength(1)
  })
})

describe("onHandTest", () => {
  const isOnHand = onHandTest(["salt", "pepper", "olive oil"])

  test("covers every kind", () => {
    expect(isOnHand("kosher salt")).toBe(true)
    expect(isOnHand("freshly ground black pepper")).toBe(true)
    expect(isOnHand("salt and pepper")).toBe(true)
    expect(isOnHand("extra-virgin olive oil")).toBe(true)
  })

  test("needs everything a combination names", () => {
    expect(onHandTest(["salt"])("salt and pepper")).toBe(false)
  })

  test("leaves other things out", () => {
    expect(isOnHand("bell pepper")).toBe(false)
    expect(isOnHand("butter")).toBe(false)
  })
})

describe("tidyOnHand", () => {
  test("folds kinds and combinations together", () => {
    expect(
      tidyOnHand(["Salt", "Black Pepper", "Pepper", "Salt and Pepper", "ice"])
    ).toEqual(["salt", "pepper", "ice"])
  })

  test("keeps other wording, without repeats", () => {
    expect(tidyOnHand(["Olive oil", "olive oil", "butter", " "])).toEqual([
      "olive oil",
      "butter",
    ])
  })
})
