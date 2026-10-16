import { describe, expect, test } from "vitest"
import {
  avoidedIn,
  canLeaveOut,
  checkTastes,
  leftOutLines,
  levelOf,
  missingDiets,
  type AvoidedFood,
} from "./tastes.ts"

const avoided = (
  food: string,
  level: AvoidedFood["level"] = "never",
  who: string | null = null
): AvoidedFood => ({ food, level, who })

const mushroom = avoided("mushroom")
const nuts = avoided("nuts", "allergy")

describe("avoided foods", () => {
  test("match a food in its other forms", () => {
    expect(avoidedIn(["8 oz mushrooms, sliced"], [mushroom])).toEqual([
      mushroom,
    ])
    const berry = avoided("berry")
    expect(avoidedIn(["1 cup mixed berries"], [berry])).toEqual([berry])
    expect(avoidedIn(["2 cups rice"], [mushroom])).toEqual([])
  })

  test("match whole words only", () => {
    const pea = avoided("pea")
    expect(avoidedIn(["1 peach, sliced"], [pea])).toEqual([])
    expect(avoidedIn(["1 cup frozen peas"], [pea])).toEqual([pea])
  })

  test("use the diet labels' careful check for nuts, dairy and the like", () => {
    // Pesto has nuts, though the word isn't there.
    expect(avoidedIn(["1/2 cup pesto"], [nuts])).toEqual([nuts])
    const dairy = avoided("Dairy")
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

describe("leaving a food out", () => {
  const stirFry = {
    name: "Chicken Stir Fry",
    lines: [
      "1 lb chicken thighs",
      "8 oz mushrooms, sliced",
      "2 tbsp soy sauce",
      "1 cup button mushrooms",
    ],
  }
  const emma = avoided("mushroom", "leave-out", "Emma")

  test("crosses off its lines, saying who it's for", () => {
    expect(checkTastes(stirFry, [emma])).toEqual({
      ruledOut: [],
      leaveOut: [{ food: "mushroom", who: "Emma", lines: [1, 3] }],
    })
    expect(leftOutLines(stirFry, [emma])).toEqual(new Set([1, 3]))
  })

  test("rules out a recipe that's named for it", () => {
    const risotto = {
      name: "Mushroom Risotto",
      lines: ["1 cup arborio rice", "8 oz mushrooms"],
    }
    expect(checkTastes(risotto, [emma])).toEqual({
      ruledOut: [emma],
      leaveOut: [],
    })
    expect(leftOutLines(risotto, [emma])).toEqual(new Set())
  })

  test("rules out a recipe the household said needs it", () => {
    expect(
      checkTastes({ ...stirFry, needs: ["mushrooms"] }, [emma])
    ).toMatchObject({ ruledOut: [emma], leaveOut: [] })
    // Needing something else changes nothing.
    expect(
      checkTastes({ ...stirFry, needs: ["chicken"] }, [emma]).leaveOut
    ).toHaveLength(1)
  })

  test("never for allergies, or for what's never eaten", () => {
    const allergy = avoided("mushroom", "allergy", "Sam")
    expect(checkTastes(stirFry, [allergy])).toEqual({
      ruledOut: [allergy],
      leaveOut: [],
    })
    expect(checkTastes(stirFry, [mushroom]).ruledOut).toEqual([mushroom])
  })

  test("never for nuts, dairy, gluten, eggs or meat, which are in too much", () => {
    expect(canLeaveOut("mushrooms")).toBe(true)
    for (const food of ["nuts", "Dairy", "gluten", "eggs", "meat"])
      expect(canLeaveOut(food)).toBe(false)
    const dairy = avoided("dairy", "leave-out")
    expect(levelOf(dairy)).toBe("never")
    expect(
      checkTastes({ name: "Mac and Cheese", lines: ["2 cups cheddar"] }, [
        dairy,
      ])
    ).toEqual({ ruledOut: [dairy], leaveOut: [] })
  })

  test("takes each food on its own", () => {
    const olives = avoided("olive", "leave-out")
    const salad = {
      name: "Greek Salad",
      lines: ["1 cucumber", "1/2 cup kalamata olives", "4 oz mushrooms"],
    }
    expect(checkTastes(salad, [emma, olives, nuts])).toEqual({
      ruledOut: [],
      leaveOut: [
        { food: "mushroom", who: "Emma", lines: [2] },
        { food: "olive", who: null, lines: [1] },
      ],
    })
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
