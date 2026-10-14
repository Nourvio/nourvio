import type { Household, MealSuggestion, Proposal } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createProposal } from "../services/proposals.ts"
import { createTestAppWithAdmin } from "../test/helpers.ts"

// October 19, 2026 is a Monday; the 24th a Saturday.
const MONDAY = "2026-10-19"
const SATURDAY = "2026-10-24"

describe("household tastes and rules", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>

  const setTastes = (body: Record<string, unknown>) =>
    t.admin.put("/api/household/tastes", {
      avoid: [],
      diets: [],
      weeknightMinutes: null,
      notes: [],
      ...body,
    })
  const suggest = async (slots: { date: string; meal: string }[]) =>
    (
      (await t.admin.post("/api/plan/suggest", { slots })).body
        .suggestions as MealSuggestion[]
    ).map((s) => `${s.date} ${s.recipe.name}`)

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
    const recipes = [
      {
        name: "Mushroom Risotto",
        totalMinutes: 25,
        ingredients: ["8 oz cremini mushrooms", "1 cup arborio rice"],
      },
      {
        name: "Pesto Pasta",
        totalMinutes: 20,
        ingredients: ["1 lb pasta", "1/2 cup basil pesto"],
      },
      {
        name: "Chicken Tacos",
        totalMinutes: 25,
        ingredients: ["1 lb chicken thighs", "8 corn tortillas"],
      },
      {
        name: "Veggie Stir Fry",
        totalMinutes: 20,
        ingredients: ["1 block firm tofu", "2 cups broccoli"],
      },
      {
        name: "Bean Chili",
        totalMinutes: 90,
        ingredients: ["2 cans black beans", "1 onion"],
      },
    ]
    for (const recipe of recipes) await t.admin.post("/api/recipes", recipe)
  })
  afterAll(() => t.close())

  test("anyone in the household can set them, and they're checked", async () => {
    const res = await setTastes({
      avoid: [{ food: "mushrooms", who: "Jamie", allergy: false }],
      notes: ["No fish on Mondays"],
    })
    expect(res.status).toBe(200)
    const household = (await t.admin.get("/api/household")).body
      .household as Household
    expect(household.tastes).toEqual({
      avoid: [{ food: "mushrooms", who: "Jamie", allergy: false }],
      diets: [],
      weeknightMinutes: null,
      notes: ["No fish on Mondays"],
    })
    expect((await setTastes({ weeknightMinutes: 5 })).status).toBe(400)
  })

  test("suggestions leave out what someone doesn't eat or is allergic to", async () => {
    await setTastes({
      avoid: [
        { food: "mushrooms", who: "Jamie", allergy: false },
        { food: "nuts", who: "Sam", allergy: true },
      ],
    })
    // Over many tries, never the risotto (mushrooms) or the pesto (pine nuts).
    for (let i = 0; i < 10; i++) {
      const names = await suggest([
        { date: MONDAY, meal: "dinner" },
        { date: SATURDAY, meal: "dinner" },
      ])
      expect(names.join()).not.toMatch(/Risotto|Pesto/)
    }
  })

  test("weeknight dinners stay under the limit; weekends don't have to", async () => {
    await setTastes({ weeknightMinutes: 30 })
    for (let i = 0; i < 10; i++) {
      const [monday] = await suggest([{ date: MONDAY, meal: "dinner" }])
      expect(monday).not.toContain("Bean Chili")
    }
    const weekend = new Set<string>()
    for (let i = 0; i < 30; i++) {
      for (const name of await suggest([{ date: SATURDAY, meal: "dinner" }])) {
        weekend.add(name)
      }
    }
    expect([...weekend].join()).toContain("Bean Chili")
  })

  test("every meal fits the household's diets", async () => {
    await setTastes({ diets: ["vegetarian"] })
    for (let i = 0; i < 10; i++) {
      const names = await suggest([
        { date: MONDAY, meal: "dinner" },
        { date: SATURDAY, meal: "dinner" },
      ])
      expect(names.join()).not.toContain("Chicken Tacos")
    }
  })

  test("a remembered taste from the assistant is added, not repeated", async () => {
    await setTastes({
      avoid: [{ food: "mushrooms", who: "Jamie", allergy: false }],
    })
    const household = (await t.admin.get("/api/household")).body
      .household as Household
    const proposal = await createProposal(t.db, {
      householdId: household.id,
      kind: "tastes",
      recipeId: null,
      payload: {
        summary: "Remember Sam's peanut allergy",
        before: {},
        after: {},
        tastes: {
          avoid: [
            { food: "peanuts", who: "Sam", allergy: true },
            { food: "mushrooms", who: "Jamie", allergy: false },
          ],
          notes: ["The kids like it mild"],
        },
      },
      userId: t.adminUser.id,
      conversationId: null,
    })
    const applied = await t.admin.post(
      `/api/proposals/${proposal.id}/apply`,
      {}
    )
    expect(applied.status).toBe(200)
    expect((applied.body.proposal as Proposal).status).toBe("applied")
    const after = (await t.admin.get("/api/household")).body
      .household as Household
    expect(after.tastes.avoid).toEqual([
      { food: "mushrooms", who: "Jamie", allergy: false },
      { food: "peanuts", who: "Sam", allergy: true },
    ])
    expect(after.tastes.notes).toEqual(["The kids like it mild"])
  })
})
