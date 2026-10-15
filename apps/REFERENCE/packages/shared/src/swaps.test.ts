import { describe, expect, test } from "vitest"

import { listFoods, swapIntoStep } from "./swaps.ts"

const text = (pieces: ReturnType<typeof swapIntoStep>) =>
  pieces.map((piece) => piece.text).join("")

describe("swapIntoStep", () => {
  test("writes the swapped-in food where the step names the old one", () => {
    const pieces = swapIntoStep(
      "In a large bowl, whisk together the peanut butter, miso and soy sauce.",
      [{ from: "natural peanut butter", to: ["tahini"] }],
      ["white or yellow miso", "soy sauce"]
    )
    expect(text(pieces)).toBe(
      "In a large bowl, whisk together the tahini, miso and soy sauce."
    )
    expect(pieces.find((piece) => piece.insteadOf)).toEqual({
      text: "tahini",
      insteadOf: "peanut butter",
    })
  })

  test("names every food a swap uses, and keeps a sentence's capital", () => {
    expect(
      text(
        swapIntoStep("Buttermilk goes in last. Stir the buttermilk well.", [
          { from: "buttermilk", to: ["milk", "lemon juice"] },
        ])
      )
    ).toBe(
      "Milk and lemon juice goes in last. Stir the milk and lemon juice well."
    )
  })

  test("leaves another ingredient's name alone", () => {
    expect(
      text(
        swapIntoStep(
          "Melt the butter, then stir in the peanut butter.",
          [{ from: "unsalted butter", to: ["coconut oil"] }],
          ["natural peanut butter"]
        )
      )
    ).toBe("Melt the coconut oil, then stir in the peanut butter.")
  })

  test("a step that doesn't mention it stays as it was", () => {
    expect(
      swapIntoStep("Bring a large pot of water to a boil.", [
        { from: "natural peanut butter", to: ["tahini"] },
      ])
    ).toEqual([{ text: "Bring a large pot of water to a boil." }])
  })
})

test("listFoods", () => {
  expect(listFoods(["tahini"])).toBe("tahini")
  expect(listFoods(["milk", "lemon juice"])).toBe("milk and lemon juice")
  expect(listFoods(["oil", "garlic", "salt"])).toBe("oil, garlic and salt")
})
