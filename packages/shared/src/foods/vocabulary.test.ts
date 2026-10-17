import { describe, expect, test } from "vitest"
import { BRANDS_EN } from "./data/brands-en.ts"
import { NAMES_EN } from "./data/en.ts"
import { FOODS } from "./data/foods.ts"
import { findFood } from "./vocabulary.ts"

// The vocabulary's data holding together, and finding foods in words.

const wordsOf = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join(" ")

describe("the data", () => {
  test("names, parents and brands are of foods it knows", () => {
    for (const key of Object.keys(NAMES_EN))
      expect(FOODS, key).toHaveProperty([key])
    for (const [key, facts] of Object.entries(FOODS)) {
      if (facts.parent)
        expect(FOODS, `${key}'s parent`).toHaveProperty([facts.parent])
    }
    for (const key of Object.values(BRANDS_EN.means)) {
      expect(FOODS, key).toHaveProperty([key])
    }
  })

  test("keys are food keys: lowercase", () => {
    for (const key of Object.keys(FOODS)) expect(key).toBe(key.toLowerCase())
  })

  test("no name is two foods'", () => {
    const owner = new Map<string, string>()
    const clashes: string[] = []
    for (const key of Object.keys(FOODS)) {
      for (const name of [key, ...(NAMES_EN[key] ?? [])]) {
        const words = wordsOf(name)
        const was = owner.get(words)
        if (was && was !== key) clashes.push(`${name}: ${was} and ${key}`)
        owner.set(words, key)
      }
    }
    expect(clashes).toEqual([])
  })
})

describe("finding a food", () => {
  test.each([
    ["all-purpose flour", "all-purpose flour", "all-purpose flour"],
    [
      "King Arthur Unbleached All-Purpose Flour",
      "all-purpose flour",
      "All-Purpose Flour",
    ],
    ["plain flour", "all-purpose flour", "plain flour"],
    ["Diamond Crystal", "salt", "salt"],
    ["Morton kosher salt", "salt", "kosher salt"],
    ["finely chopped fresh flat-leaf parsley", "parsley", "flat-leaf parsley"],
    ["large eggs", "egg", "large eggs"],
    ["large onions", "onion", "onions"],
    ["dried oregano", "dried oregano", "dried oregano"],
    ["dried porcini mushrooms", "dried mushroom", "dried porcini mushrooms"],
    ["red onion", "red onion", "red onion"],
    ["dark brown sugar", "dark brown sugar", "dark brown sugar"],
    ["light brown sugar", "brown sugar", "light brown sugar"],
    ["vanilla ice cream", "ice cream", "ice cream"],
    ["chicken sausage", "sausage", "sausage"],
    ["salt and black pepper", "black pepper", "black pepper"],
    ["cooked and peeled tiger prawn tails left on", "shrimp", "prawn tails"],
    ["x 400g 14oz cans butter bean", "butter bean", "butter bean"],
    [
      "chipotle peppers from a can of chipotles in adobo sauce",
      "chipotle in adobo",
      "chipotles in adobo sauce",
    ],
    ["boneless skinless chicken breasts", "chicken breast", "chicken breasts"],
    ["jalapeños", "jalapeño", "jalapeños"],
    ["red chillies", "red chili", "red chillies"],
    ["tinned tomatoes", "diced tomato", "tinned tomatoes"],
    ["confectioners' sugar", "powdered sugar", "confectioners' sugar"],
  ])("%s", (text, key, name) => {
    expect(findFood(text)).toEqual({ key, name })
  })

  test("nothing it doesn't know", () => {
    expect(findFood("gochugaru")).toBeNull()
    expect(findFood("easy green salad")).toBeNull()
  })
})
