import type { Recipe } from "@mise/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createAiService } from "../ai/service.ts"
import type { AiProviderFactory } from "../ai/types.ts"
import {
  FdcKeyError,
  FdcRateLimitError,
  type FdcClientFactory,
  type FdcFood,
} from "../nutrition/fdc.ts"
import { gramsFor, readAmount } from "../nutrition/grams.ts"
import {
  createNutritionService,
  guessCandidate,
} from "../services/nutrition.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

const none = {
  calories: null,
  fat: null,
  saturatedFat: null,
  carbohydrates: null,
  fiber: null,
  sugar: null,
  protein: null,
  sodium: null,
  cholesterol: null,
}

/** A few real USDA foods, trimmed. */
const FOODS: FdcFood[] = [
  {
    fdcId: 170000,
    description: "Onions, raw",
    dataType: "SR Legacy",
    nutrients: {
      ...none,
      calories: 40,
      carbohydrates: 9.3,
      protein: 1.1,
      sodium: 4,
    },
    portions: [
      { label: "cup, chopped", amount: 1, grams: 160 },
      { label: 'medium (2-1/2" dia)', amount: 1, grams: 110 },
    ],
  },
  {
    fdcId: 171413,
    description: "Oil, olive, salad or cooking",
    dataType: "SR Legacy",
    nutrients: { ...none, calories: 884, fat: 100, saturatedFat: 13.8 },
    portions: [
      { label: "tablespoon", amount: 1, grams: 13.5 },
      { label: "cup", amount: 1, grams: 216 },
    ],
  },
  {
    fdcId: 2646171,
    description: "Chicken, thigh, boneless, skinless, raw",
    dataType: "Foundation",
    nutrients: { ...none, calories: 121, protein: 19.7, sodium: 95 },
    portions: [{ label: "RACC", amount: 1, grams: 114 }],
  },
  {
    fdcId: 169230,
    description: "Garlic, raw",
    dataType: "SR Legacy",
    nutrients: { ...none, calories: 149, carbohydrates: 33 },
    portions: [{ label: "clove", amount: 1, grams: 3 }],
  },
]

const SEARCH: Record<string, { fdcId: number; description: string }[]> = {
  onion: [
    { fdcId: 169844, description: "DENNY'S, onion rings" },
    { fdcId: 170000, description: "Onions, raw" },
  ],
  chicken: [
    {
      fdcId: 172855,
      description: "Chicken, skin (drumsticks and thighs), raw",
    },
    { fdcId: 2646171, description: "Chicken, thigh, boneless, skinless, raw" },
  ],
  "olive oil": [
    { fdcId: 167737, description: "Oil, corn, peanut, and olive" },
    { fdcId: 171413, description: "Oil, olive, salad or cooking" },
  ],
  garlic: [{ fdcId: 169230, description: "Garlic, raw" }],
}

function fakeUsda() {
  const calls = { search: 0, food: 0 }
  const factory: FdcClientFactory = (key) => ({
    async search(query) {
      if (key.startsWith("bad")) throw new FdcKeyError("refused")
      calls.search++
      const found = Object.entries(SEARCH).find(([word]) =>
        query.toLowerCase().includes(word)
      )
      return found?.[1] ?? []
    },
    async food(fdcId) {
      calls.food++
      return FOODS.find((f) => f.fdcId === fdcId) ?? null
    },
  })
  return { calls, factory }
}

/** Picks like a careful model would, and weighs chicken thighs at 120 g each. */
function fakeAi() {
  const calls = { pick: 0, estimate: 0 }
  const factory: AiProviderFactory = (id) => ({
    id,
    async listModels() {
      return []
    },
    async extract(request) {
      const text = (request.parts[0] as { text: string }).text
      if (request.schemaName === "nutrition_estimate") {
        calls.estimate++
        return {
          data: { ...none, calories: 500, protein: 30 } as never,
          usage: { inputTokens: 100, outputTokens: 20 },
        }
      }
      calls.pick++
      const lines = text.split("\n").filter((l) => /^\d+\. /.test(l))
      return {
        data: {
          lines: lines.map((line, i) => {
            const lower = line.toLowerCase()
            const fdcId = lower.includes("onion")
              ? 170000
              : lower.includes("chicken")
                ? 2646171
                : lower.includes("olive oil")
                  ? 171413
                  : lower.includes("garlic")
                    ? 169230
                    : null
            const thighs = /(\d+) chicken thighs/.exec(lower)
            return {
              line: i + 1,
              fdcId,
              grams: thighs ? Number(thighs[1]) * 120 : null,
            }
          }),
        } as never,
        usage: { inputTokens: 300, outputTokens: 60 },
      }
    },
  })
  return { calls, factory }
}

describe("weighing ingredients", () => {
  const onion = FOODS[0]!.portions
  test.each([
    ["1 1/2 lb chicken thighs", [], 680.388],
    ["1 onion, diced", onion, 110],
    ["2 cups chopped onion", onion, 320],
    ["2 tbsp olive oil", FOODS[1]!.portions, 27],
    ["3 cloves garlic", FOODS[3]!.portions, 9],
    ["1 (15 oz) can kidney beans", [], 425.243],
    ["2-3 tbsp olive oil", FOODS[1]!.portions, 33.75],
  ])("%s", (line, portions, grams) => {
    expect(gramsFor(readAmount(line)!, portions)).toBeCloseTo(grams, 2)
  })

  test("skips what doesn't count, and uses what it learned", () => {
    expect(readAmount("Salt and pepper to taste")).toBeNull()
    expect(readAmount("1 cup water")).toBeNull()
    const thighs = readAmount("4 chicken thighs")!
    expect(gramsFor(thighs, FOODS[2]!.portions)).toBeNull()
    expect(gramsFor(thighs, FOODS[2]!.portions, { each: 120 })).toBe(480)
  })
})

describe("guessing a match without AI", () => {
  test.each([
    ["onion", "onion", 170000],
    ["chicken thighs", "chicken", 2646171],
    ["olive oil", "olive oil", 171413],
  ])("%s", (name, query, fdcId) => {
    expect(guessCandidate(name, SEARCH[query]!)?.fdcId).toBe(fdcId)
  })
})

describe("nutrition", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const usda = fakeUsda()
  const ai = fakeAi()

  const recipe = async (body: Record<string, unknown>) =>
    (await t.admin.post("/api/recipes", body)).body.recipe as Recipe
  const workOut = (id: string) => t.admin.post(`/api/recipes/${id}/nutrition`)

  beforeAll(async () => {
    t = await createTestAppWithAdmin({
      fdcFactory: usda.factory,
      aiFactory: ai.factory,
    })
  })
  afterAll(() => t.close())

  test("needs a USDA or AI key", async () => {
    const r = await recipe({
      name: "Toast",
      servings: 1,
      ingredients: ["1 slice bread"],
    })
    const res = await workOut(r.id)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/USDA key or an AI key/)
  })

  test("keeps the USDA key in Settings, for the server admin", async () => {
    expect(
      (await t.admin.get("/api/nutrition/settings")).body.settings.usdaKey
    ).toEqual({ configured: false, source: null, hint: null })
    expect(
      (
        await t.admin.post("/api/nutrition/settings/test", {
          usdaKey: "bad-key-123456",
        })
      ).status
    ).toBe(400)
    const saved = await t.admin.put("/api/nutrition/settings", {
      usdaKey: "good-key-123456",
    })
    expect(saved.body.settings.usdaKey).toEqual({
      configured: true,
      source: "settings",
      hint: "…3456",
    })
    expect(
      (await t.admin.post("/api/nutrition/settings/test", {})).body.ok
    ).toBe(true)
    expect((await t.admin.get("/api/ai/status")).body.usda).toBe(true)
    await t.admin.put("/api/ai/settings", {
      keys: { anthropic: "sk-ant-test-key-1234" },
    })
  })

  test("calculates from USDA data, with the AI picking matches", async () => {
    const r = await recipe({
      name: "Garlic Chicken",
      servings: 4,
      ingredients: [
        "1 1/2 lb boneless skinless chicken thighs",
        "1 onion, diced",
        "2 tbsp olive oil",
        "3 cloves garlic",
        "Salt and pepper to taste",
        "1 cup water",
        "1 sprig mystery herb",
      ],
    })
    const res = await workOut(r.id)
    expect(res.status).toBe(200)
    // 680 g thighs, 110 g onion, 27 g oil, 9 g garlic, over 4 servings.
    expect(res.body.recipe.nutrition).toMatchObject({
      source: "calculated",
      calories: 280,
      fat: 6.8,
      protein: 33.8,
      notCounted: ["1 sprig mystery herb"],
    })
    expect(ai.calls.pick).toBe(1)
  })

  test("remembers matches, so the next recipe needs no search or AI", async () => {
    const before = { ...usda.calls, pick: ai.calls.pick }
    const r = await recipe({
      name: "Onion Fry",
      servings: 2,
      ingredients: ["2 onions", "1 tbsp olive oil"],
    })
    const res = await workOut(r.id)
    // 220 g onion and 13.5 g oil, over 2 servings.
    expect(res.body.recipe.nutrition).toMatchObject({
      source: "calculated",
      calories: 104,
      notCounted: [],
    })
    expect(usda.calls.search).toBe(before.search)
    expect(usda.calls.food).toBe(before.food)
    expect(ai.calls.pick).toBe(before.pick)
  })

  test("weighs what portions can't, and remembers that too", async () => {
    const first = await recipe({
      name: "Thighs",
      servings: 4,
      ingredients: ["4 chicken thighs"],
    })
    const picks = ai.calls.pick
    expect((await workOut(first.id)).body.recipe.nutrition.calories).toBe(145)
    expect(ai.calls.pick).toBe(picks + 1)

    const second = await recipe({
      name: "Two Thighs",
      servings: 2,
      ingredients: ["2 chicken thighs"],
    })
    expect((await workOut(second.id)).body.recipe.nutrition.calories).toBe(145)
    expect(ai.calls.pick).toBe(picks + 1)
  })

  test("estimates when too much can't be counted", async () => {
    const r = await recipe({
      name: "Mystery",
      servings: 2,
      ingredients: ["2 cups mystery grain", "1 lb unknown thing", "1 onion"],
    })
    const res = await workOut(r.id)
    expect(res.body.recipe.nutrition).toMatchObject({
      source: "estimate",
      calories: 500,
      protein: 30,
    })
  })

  test("estimates without a USDA key, and needs servings", async () => {
    await t.admin.put("/api/nutrition/settings", { usdaKey: null })
    const r = await recipe({
      name: "Soup",
      servings: 3,
      ingredients: ["1 onion", "4 cups broth"],
    })
    expect((await workOut(r.id)).body.recipe.nutrition.source).toBe("estimate")

    const noServings = await recipe({ name: "Stew", ingredients: ["1 onion"] })
    const res = await workOut(noServings.id)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/servings/)
    await t.admin.put("/api/nutrition/settings", { usdaKey: "good-key-123456" })
  })

  test("settings are for the server admin", async () => {
    await t.admin.post("/api/users", {
      displayName: "Sam",
      username: "sam",
      password: "a long enough password",
      role: "member",
    })
    const sam = apiClient(t.app)
    await sam.post("/api/auth/login", {
      username: "sam",
      password: "a long enough password",
    })
    expect((await sam.get("/api/nutrition/settings")).status).toBe(403)
    // Anyone in the household can work out a recipe's nutrition.
    const r = await recipe({
      name: "Fry",
      servings: 1,
      ingredients: ["1 onion"],
    })
    expect((await sam.post(`/api/recipes/${r.id}/nutrition`)).status).toBe(200)
  })
})

describe("the whole library", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const usda = fakeUsda()

  async function finished(
    get: () => Promise<{ job: { status: string } | null }>
  ) {
    for (let i = 0; i < 100; i++) {
      const status = await get()
      if (status.job && status.job.status !== "running") return status
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error("The run never finished")
  }

  beforeAll(async () => {
    t = await createTestAppWithAdmin({ fdcFactory: usda.factory })
    await t.admin.put("/api/nutrition/settings", { usdaKey: "good-key-123456" })
    for (const [name, servings] of [
      ["Onion Soup", 4],
      ["Garlic Oil", 8],
      ["No Servings", null],
    ] as const) {
      await t.admin.post("/api/recipes", {
        name,
        servings,
        ingredients:
          name === "Garlic Oil"
            ? ["1 cup olive oil", "6 cloves garlic"]
            : ["3 onions"],
      })
    }
  })
  afterAll(() => t.close())

  test("works out every recipe that has none, and shows on the plan", async () => {
    const before = (await t.admin.get("/api/nutrition/library")).body
    expect(before).toMatchObject({ job: null, missing: 2, noServings: 1 })
    const started = await t.admin.post("/api/nutrition/library")
    expect(started.status).toBe(201)
    expect(started.body.job).toMatchObject({ status: "running", total: 2 })

    const after = await finished(
      async () => (await t.admin.get("/api/nutrition/library")).body
    )
    expect(after).toMatchObject({
      job: { status: "done", done: 2, failed: 0 },
      missing: 0,
      noServings: 1,
    })
    expect((await t.admin.post("/api/nutrition/library")).status).toBe(400)

    const soup = (await t.admin.get("/api/recipes/onion-soup")).body.recipe
    expect(soup.nutrition).toMatchObject({ source: "calculated", calories: 33 })
    const entry = await t.admin.post("/api/plan/entries", {
      date: "2026-10-20",
      meal: "dinner",
      recipeId: soup.id,
    })
    expect(entry.body.entry.recipe.nutrition).toEqual({
      calories: 33,
      protein: 0.9,
      carbohydrates: 7.7,
      fat: null,
    })
  })

  test("waits out USDA's hourly limit and carries on", async () => {
    let limited = 1
    const flaky: FdcClientFactory = (key) => {
      const client = usda.factory(key)
      return {
        ...client,
        async search(query) {
          if (limited-- > 0) throw new FdcRateLimitError("slow down")
          return client.search(query)
        },
      }
    }
    const ai = createAiService(t.db)
    const service = createNutritionService(t.db, ai, {
      fdcFactory: flaky,
      rateLimitWaitMs: 5,
    })
    const recipe = (
      await t.admin.post("/api/recipes", {
        name: "Garlic Bread",
        servings: 2,
        ingredients: ["4 cloves garlic", "1 tbsp butter"],
      })
    ).body.recipe
    const householdId = t.adminUser.householdId
    await service.startLibraryRun({ userId: t.adminUser.id, householdId })
    const status = await finished(() => service.libraryStatus(householdId))
    expect(status.job).toMatchObject({ status: "done", done: 1, failed: 0 })
    const after = (await t.admin.get(`/api/recipes/${recipe.id}`)).body.recipe
    // Butter isn't in the fake catalog, so it's left out.
    expect(after.nutrition).toMatchObject({
      source: "calculated",
      notCounted: ["1 tbsp butter"],
    })
  })

  test("is for household admins", async () => {
    await t.admin.post("/api/users", {
      displayName: "Sam",
      username: "sam",
      password: "a long enough password",
      role: "member",
    })
    const sam = apiClient(t.app)
    await sam.post("/api/auth/login", {
      username: "sam",
      password: "a long enough password",
    })
    expect((await sam.get("/api/nutrition/library")).status).toBe(403)
    expect((await sam.post("/api/nutrition/library")).status).toBe(403)
  })
})

describe("nutrition after saving", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const usda = fakeUsda()

  async function settled(id: string, check: (recipe: Recipe) => boolean) {
    for (let i = 0; i < 50; i++) {
      const recipe = (await t.admin.get(`/api/recipes/${id}`)).body
        .recipe as Recipe
      if (check(recipe)) return recipe
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error("Nutrition never settled")
  }

  beforeAll(async () => {
    t = await createTestAppWithAdmin({
      fdcFactory: usda.factory,
      autoNutrition: true,
    })
    await t.admin.put("/api/nutrition/settings", { usdaKey: "good-key-123456" })
  })
  afterAll(() => t.close())

  test("works it out, scales it with servings, and redoes it for new ingredients", async () => {
    const created = (
      await t.admin.post("/api/recipes", {
        name: "Onions",
        servings: 2,
        ingredients: ["2 onions"],
      })
    ).body.recipe as Recipe
    // No AI here: the match is a plain guess.
    const first = await settled(created.id, (r) => r.nutrition !== null)
    expect(first.nutrition).toMatchObject({
      source: "calculated",
      calories: 44,
    })

    const body = {
      name: "Onions",
      ingredients: ["2 onions"],
      nutrition: first.nutrition,
    }
    await t.admin.put(`/api/recipes/${created.id}`, { ...body, servings: 1 })
    await settled(created.id, (r) => r.nutrition?.calories === 88)

    await t.admin.put(`/api/recipes/${created.id}`, {
      ...body,
      servings: 1,
      ingredients: ["4 onions"],
      nutrition: { ...first.nutrition, calories: 88 },
    })
    await settled(created.id, (r) => r.nutrition?.calories === 176)
  })

  test("keeps the site's numbers", async () => {
    const created = (
      await t.admin.post("/api/recipes", {
        name: "From a site",
        servings: 2,
        ingredients: ["2 onions"],
        nutrition: { ...none, calories: 999, source: "site" },
      })
    ).body.recipe as Recipe
    await new Promise((resolve) => setTimeout(resolve, 100))
    const after = (await t.admin.get(`/api/recipes/${created.id}`)).body.recipe
    expect(after.nutrition).toMatchObject({ source: "site", calories: 999 })
  })
})
