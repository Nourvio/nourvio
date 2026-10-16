import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import { Recipe } from "../../../../database/entities/index.ts"
import type { Database } from "../../../../database/orm.ts"
import type {
  FetchOptions,
  Fetcher,
} from "../../../../services/fetch/public-fetch.ts"
import type { JobRunner } from "../../../../services/jobs/runner.ts"
import {
  fakeAiFetcher,
  GOOD_KEYS,
  mockAiModels,
  type MockCall,
} from "../../../../test/ai.ts"
import { createTestApp, setUpServer, TestClient } from "../../../../test/app.ts"

// Nutrition: estimated by AI, or added up from USDA FoodData Central, here
// a fake: `usda` is what it knows, and what was asked of it is kept. The
// model answers picks from `picks` and estimates with ESTIMATE.

const USDA_KEY = "usda-test-key-1234"

type Food = {
  fdcId: number
  description: string
  dataType: string
  foodNutrients: { nutrient: { id: number }; amount: number }[]
  foodPortions: {
    amount: number
    gramWeight: number
    modifier?: string
    measureUnit?: { name: string }
  }[]
}

const per100 = (calories: number, protein: number, fat: number, carbs = 0) => [
  { nutrient: { id: 1008 }, amount: calories },
  { nutrient: { id: 1003 }, amount: protein },
  { nutrient: { id: 1004 }, amount: fat },
  { nutrient: { id: 1005 }, amount: carbs },
  { nutrient: { id: 1093 }, amount: 80 },
]

const FOODS: Food[] = [
  {
    fdcId: 1,
    description: "Chicken, skin (drumsticks and thighs), raw",
    dataType: "SR Legacy",
    foodNutrients: per100(349, 13, 32),
    foodPortions: [],
  },
  {
    fdcId: 2,
    description: "Chicken, dark meat, thigh, meat only, raw",
    dataType: "SR Legacy",
    foodNutrients: per100(121, 20, 4),
    foodPortions: [{ amount: 1, gramWeight: 114, modifier: "thigh" }],
  },
  {
    fdcId: 3,
    description: "Oil, olive, salad or cooking",
    dataType: "SR Legacy",
    foodNutrients: per100(884, 0, 100),
    foodPortions: [
      { amount: 1, gramWeight: 13.5, measureUnit: { name: "tablespoon" } },
    ],
  },
  {
    fdcId: 4,
    description: "Lemon juice, raw",
    dataType: "SR Legacy",
    foodNutrients: per100(22, 0.4, 0.2, 6.9),
    foodPortions: [],
  },
]
const SEARCH: Record<string, number[]> = {
  "chicken thighs": [1, 2],
  "olive oil": [3],
  "lemons, juiced": [4],
  lemons: [4],
}

const searched: string[] = []
const keysSent: string[] = []
const aiFetcher = fakeAiFetcher()
const fetcher: Fetcher = async (url, options?: FetchOptions) => {
  if (!url.startsWith("https://api.nal.usda.gov/fdc/v1/")) {
    return aiFetcher(url, options)
  }
  const key = options?.headers?.["x-api-key"] ?? ""
  keysSent.push(key)
  const answer = (status: number, body: unknown) => ({
    url,
    status,
    contentType: "application/json",
    body: Buffer.from(JSON.stringify(body)),
  })
  if (key !== USDA_KEY) return answer(403, { error: "API_KEY_INVALID" })
  if (url.endsWith("/foods/search")) {
    const query = (options?.json as { query: string }).query
    searched.push(query)
    const ids = SEARCH[query] ?? []
    return answer(200, {
      foods: ids.map((id) => FOODS.find((food) => food.fdcId === id)!),
    })
  }
  const id = Number(url.split("/").at(-1))
  const food = FOODS.find((f) => f.fdcId === id)
  return food ? answer(200, food) : answer(404, {})
}

const ESTIMATE = {
  calories: 523.4,
  protein: 30.04,
  carbs: null,
  fat: 40,
  fiber: -1,
  sugar: 2,
  sodium: 610.6,
}
let picks: { line: number; fdcId: number | null; grams: number | null }[] = []
const asked: string[] = []
const reply = (call: MockCall) => {
  const prompt = call.prompt as { role: string; content: unknown }[]
  const system = prompt.find((m) => m.role === "system")?.content
  if (typeof system !== "string") return "ok"
  if (system.startsWith("You match recipe ingredient")) {
    asked.push("pick")
    return JSON.stringify({ lines: picks })
  }
  if (system.startsWith("You estimate nutrition")) {
    asked.push("estimate")
    return JSON.stringify(ESTIMATE)
  }
  return "ok"
}

let app: App
let database: Database
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient

beforeAll(async () => {
  const test = await createTestApp({
    fetcher,
    ai: mockAiModels(undefined, [], undefined, reply),
  })
  ;({ app, database, jobs, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  const key = await kyle.post("/api/settings/server/ai/keys", {
    provider: "anthropic",
    key: GOOD_KEYS.anthropic,
  })
  expect(key.status, await key.clone().text()).toBe(201)
})

afterAll(() => close())

const LINES = [
  "2 lb chicken thighs",
  "1 tbsp olive oil",
  "2 lemons, juiced",
  "Salt to taste",
]

async function addRecipe(name: string, ingredients = LINES, servings = 4) {
  const res = await kyle.post("/api/recipes", {
    name,
    servings,
    ingredients,
    steps: ["Roast it all."],
  })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as { id: string; slug: string }
}

const workOut = async (id: string) => {
  const res = await kyle.post(`/api/recipes/${id}/nutrition`, {})
  return { status: res.status, body: await res.json() }
}

describe("a recipe's nutrition", () => {
  test("without a USDA key, AI estimates it", async () => {
    const recipe = await addRecipe("Lemon Chicken")
    const { status, body } = await workOut(recipe.id)
    expect(status, JSON.stringify(body)).toBe(200)
    // Rounded, and what makes no sense left out.
    expect(body.nutrition).toEqual({
      source: "estimate",
      calories: 523,
      protein: 30,
      fat: 40,
      sugar: 2,
      sodium: 611,
      servings: 4,
    })
    expect(asked.at(-1)).toBe("estimate")
  })

  test("with a USDA key, is added up from USDA's data, AI picking the foods", async () => {
    const saved = await kyle.patch("/api/settings/server", {
      "nutrition.usdaKey": USDA_KEY,
    })
    expect(saved.status, await saved.clone().text()).toBe(200)
    const capabilities = await (await kyle.get("/api/capabilities")).json()
    expect(capabilities.capabilities).toContain("nutrition")

    // USDA's first answer for chicken thighs is the skin: AI picks the meat.
    picks = [
      { line: 1, fdcId: 2, grams: null },
      { line: 2, fdcId: 3, grams: null },
      { line: 3, fdcId: 4, grams: 90 },
    ]
    const recipe = await addRecipe("Roast Chicken")
    const { status, body } = await workOut(recipe.id)
    expect(status, JSON.stringify(body)).toBe(200)
    // 2 lb of thigh, a tablespoon of oil as bakers weigh it, and the 90 g
    // of juice AI weighed, over 4 servings; salt to taste isn't counted.
    const oil = (14.7868 * 218) / 236.588
    const calories = (121 * 907.184 + 884 * oil + 22 * 90) / 100 / 4
    expect(body.nutrition).toMatchObject({
      source: "calculated",
      calories: Math.round(calories),
      protein: Math.round(((20 * 907.184 + 0.4 * 90) / 100 / 4) * 10) / 10,
      missing: [],
      servings: 4,
    })
    expect(keysSent.every((key) => key === USDA_KEY)).toBe(true)
    expect(searched).toHaveLength(3)
    expect(searched).toContain("chicken thighs")

    // The next recipe with them doesn't ask again: matches are kept, and
    // what a juiced lemon weighs was learned.
    searched.length = 0
    asked.length = 0
    const again = await workOut((await addRecipe("Lemon Thighs")).id)
    expect(again.body.nutrition.calories).toBe(Math.round(calories))
    expect(searched).toEqual([])
    expect(asked).toEqual([])
  })

  test("says which lines it couldn't count, and estimates when too many", async () => {
    picks = [{ line: 1, fdcId: null, grams: null }]
    const some = await workOut(
      (
        await addRecipe("Chicken and Saffron", [
          "2 lb chicken thighs",
          "1 tbsp olive oil",
          "1 pinch saffron",
        ])
      ).id
    )
    expect(some.body.nutrition).toMatchObject({
      source: "calculated",
      missing: ["1 pinch saffron"],
    })

    picks = [
      { line: 1, fdcId: null, grams: null },
      { line: 2, fdcId: null, grams: null },
    ]
    const most = await workOut(
      (
        await addRecipe("Mystery Stew", [
          "1 cup mystery broth",
          "2 cups secret paste",
          "1 lb chicken thighs",
        ])
      ).id
    )
    expect(most.body.nutrition.source).toBe("estimate")
  })

  test("needs servings and ingredients", async () => {
    const noServings = await kyle.post("/api/recipes", {
      name: "Soup",
      ingredients: ["1 onion"],
      steps: [],
    })
    const { status, body } = await workOut((await noServings.json()).id)
    expect(status).toBe(400)
    expect(body.error.code).toBe("no_servings")
  })
})

describe("after saving", () => {
  test("a recipe's worked out by itself, and servings alone rescale it", async () => {
    const recipe = await addRecipe("Weeknight Chicken")
    await jobs.drain()
    let got = await (await kyle.get(`/api/recipes/${recipe.slug}`)).json()
    const calories = got.nutrition.calories as number
    expect(got.nutrition).toMatchObject({ source: "calculated", servings: 4 })

    // Twice the servings, half a serving's worth, and nothing asked.
    asked.length = 0
    const input = (changes: object) => ({
      name: got.name,
      description: null,
      servings: 4,
      yieldText: null,
      prepMinutes: null,
      cookMinutes: null,
      totalMinutes: null,
      notes: null,
      sourceUrl: null,
      rating: null,
      tags: [],
      ingredients: LINES,
      steps: ["Roast it all."],
      ...changes,
    })
    const doubled = await kyle.put(
      `/api/recipes/${recipe.slug}`,
      input({ servings: 8 })
    )
    expect(doubled.status, await doubled.clone().text()).toBe(200)
    got = await doubled.json()
    expect(got.nutrition).toMatchObject({
      calories: Math.round(calories / 2),
      servings: 8,
    })
    expect(asked).toEqual([])

    // New ingredients: worked out again.
    await kyle.put(
      `/api/recipes/${recipe.slug}`,
      input({ servings: 8, ingredients: ["2 lb chicken thighs"] })
    )
    await jobs.drain()
    got = await (await kyle.get(`/api/recipes/${recipe.slug}`)).json()
    expect(got.nutrition.calories).toBe(Math.round((121 * 907.184) / 100 / 8))
  })

  test("the plan says each meal's calories", async () => {
    const recipe = await addRecipe("Plan Chicken")
    await jobs.drain()
    const planned = await kyle.post("/api/plan/entries", {
      date: "2026-10-20",
      meal: "dinner",
      recipe: recipe.id,
    })
    expect(planned.status, await planned.clone().text()).toBe(201)
    expect((await planned.json()).recipe.calories).toEqual(expect.any(Number))
  })
})

describe("the library", () => {
  test("says what's missing, and a run works it all out", async () => {
    await jobs.drain()
    let library = await (await kyle.get("/api/recipes/nutrition")).json()
    expect(library).toMatchObject({ missing: 0, noServings: 1, run: null })
    const done = await kyle.post("/api/recipes/nutrition", {})
    expect(done.status).toBe(400)
    expect((await done.json()).error.code).toBe("all_worked_out")

    // Two that came in without it, say from an old export.
    const em = database.em.fork()
    const two = await em.find(
      Recipe,
      { name: { $in: ["Lemon Chicken", "Roast Chicken"] } },
      { filters: false }
    )
    for (const recipe of two) recipe.nutrition = null
    await em.flush()
    library = await (await kyle.get("/api/recipes/nutrition")).json()
    expect(library.missing).toBe(2)

    const res = await kyle.post("/api/recipes/nutrition", {})
    expect(res.status, await res.clone().text()).toBe(202)
    expect(await res.json()).toMatchObject({ status: "queued", total: 2 })
    await jobs.drain()
    library = await (await kyle.get("/api/recipes/nutrition")).json()
    expect(library).toMatchObject({
      missing: 0,
      run: { status: "done", total: 2, workedOut: 2, failed: 0 },
    })
  })
})

describe("the USDA key", () => {
  test("can be tested, and a wrong one is said so", async () => {
    const good = await kyle.post("/api/settings/server/nutrition/test", {})
    expect(good.status, await good.clone().text()).toBe(200)
    const bad = await kyle.post("/api/settings/server/nutrition/test", {
      usdaKey: "not-the-right-key",
    })
    expect(bad.status).toBe(422)
    expect((await bad.json()).error.code).toBe("usda_key_refused")
  })
})
