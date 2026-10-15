import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { parseMealieTime, type MealieFetch } from "../import/mealie.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

const TOKEN = "mealie-token-abcdef123456"
const MEALIE = "http://192.168.1.20:9000"

// Shaped like Mealie 2.x.
const TIKKA = {
  id: "0b9f6c1e-1111-4a1a-9a1a-000000000001",
  slug: "chicken-tikka-masala",
  name: "Chicken Tikka Masala",
  description: "Our Friday favorite.",
  recipeServings: 4,
  recipeYield: "4 servings",
  prepTime: "20 minutes",
  performTime: "1 hour",
  totalTime: "1 hour 20 minutes",
  tags: [{ name: "Indian" }, { name: "Dinner" }],
  recipeCategory: [{ name: "Main" }, { name: "dinner" }],
  rating: 4.6,
  orgURL: "https://example.com/tikka",
  lastMade: "2026-09-30T18:00:00Z",
  recipeIngredient: [
    {
      title: "Marinade",
      display: "1 cup plain yogurt",
      originalText: null,
      note: "",
      quantity: 1,
      unit: { name: "cup" },
      food: { name: "plain yogurt" },
    },
    { title: "", display: "", originalText: "2 lb chicken thighs", note: "" },
    { title: "Sauce", disableAmount: true, display: "", note: "Salt to taste" },
  ],
  recipeInstructions: [
    { title: "", text: "Marinate the chicken\nfor 1 hour." },
    { title: "Cook", text: "Simmer in the sauce." },
  ],
  notes: [{ title: "Tip", text: "Better the next day." }],
  nutrition: { calories: "520 kcal", proteinContent: "40 g" },
}

// Shaped like an older Mealie 1.x recipe.
const TOAST = {
  id: "2",
  slug: "toast",
  name: "Toast",
  recipeYield: "2",
  cookTime: "PT5M",
  recipeIngredient: [{ note: "2 slices bread", disableAmount: true }],
  recipeInstructions: [{ text: "Toast." }],
  rating: null,
}

const SUMMARIES = [
  { id: TIKKA.id, slug: TIKKA.slug },
  { id: TOAST.id, slug: TOAST.slug },
  { id: "3", slug: "broken" },
]

describe("moving from Mealie", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const requested: string[] = []

  const mealieFetch: MealieFetch = async (url, init) => {
    requested.push(url)
    const auth = new Headers(init.headers).get("authorization")
    if (auth !== `Bearer ${TOKEN}`) {
      return Response.json({ detail: "Unauthorized" }, { status: 401 })
    }
    const path = url.slice(MEALIE.length)
    if (path === "/api/app/about") return Response.json({ version: "v2.1.0" })
    const list = path.match(/^\/api\/recipes\?page=(\d+)&perPage=(\d+)/)
    if (list) {
      const [page, perPage] = [Number(list[1]), Math.min(Number(list[2]), 2)]
      return Response.json({
        page,
        per_page: perPage,
        total: SUMMARIES.length,
        total_pages: Math.ceil(SUMMARIES.length / perPage),
        items: SUMMARIES.slice((page - 1) * perPage, page * perPage),
      })
    }
    if (path === `/api/recipes/${TIKKA.slug}`) return Response.json(TIKKA)
    if (path === `/api/recipes/${TOAST.slug}`) return Response.json(TOAST)
    if (path === "/api/recipes/broken")
      return new Response("boom", { status: 500 })
    if (path === `/api/media/recipes/${TIKKA.id}/images/original.webp`) {
      const webp = await sharp({
        create: { width: 900, height: 600, channels: 3, background: "#a52" },
      })
        .webp()
        .toBuffer()
      return new Response(new Uint8Array(webp), {
        headers: { "content-type": "image/webp" },
      })
    }
    return new Response("Not found", { status: 404 })
  }

  async function finished() {
    for (let i = 0; i < 100; i++) {
      const { job } = (await t.admin.get("/api/import/mealie/job")).body
      if (job && job.status !== "running") return job
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error("The import didn't finish")
  }

  beforeAll(async () => {
    t = await createTestAppWithAdmin({ mealieFetch })
  })
  afterAll(() => t.close())

  test("is for admins only", async () => {
    await t.admin.post("/api/users", {
      displayName: "Sam",
      username: "sam",
      password: "another long password",
    })
    const member = apiClient(t.app)
    await member.post("/api/auth/login", {
      username: "sam",
      password: "another long password",
    })
    expect(
      (
        await member.post("/api/import/mealie/check", {
          url: MEALIE,
          token: TOKEN,
        })
      ).status
    ).toBe(403)
  })

  test("checks the connection and counts recipes", async () => {
    const wrong = await t.admin.post("/api/import/mealie/check", {
      url: MEALIE,
      token: "not-the-right-token",
    })
    expect(wrong.status).toBe(400)
    expect(wrong.body.fields.token).toBeTruthy()

    const res = await t.admin.post("/api/import/mealie/check", {
      url: `${MEALIE}/`,
      token: TOKEN,
    })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      version: "v2.1.0",
      total: 3,
      alreadyImported: 0,
    })
  })

  test("imports every recipe, with photos, ratings and sections", async () => {
    const started = await t.admin.post("/api/import/mealie", {
      url: MEALIE,
      token: TOKEN,
    })
    expect(started.status).toBe(201)
    const job = await finished()
    expect(job).toMatchObject({
      status: "done",
      total: 3,
      imported: 2,
      skipped: 0,
      failed: 1,
    })

    const tikka = (await t.admin.get("/api/recipes/chicken-tikka-masala")).body
      .recipe
    expect(tikka).toMatchObject({
      origin: "mealie",
      description: "Our Friday favorite.",
      servings: 4,
      prepMinutes: 20,
      cookMinutes: 60,
      totalMinutes: 80,
      rating: 5,
      sourceUrl: "https://example.com/tikka",
      lastMadeAt: "2026-09-30T18:00:00.000Z",
      notes: "Tip: Better the next day.",
      tags: ["Dinner", "Indian", "Main"],
    })
    expect(tikka.nutrition).toMatchObject({ calories: 520, protein: 40 })
    expect(tikka.imageUrl).toBeTruthy()
    expect(
      tikka.ingredients.map((i: { section: string | null; text: string }) => [
        i.section,
        i.text,
      ])
    ).toEqual([
      ["Marinade", "1 cup plain yogurt"],
      ["Marinade", "2 lb chicken thighs"],
      ["Sauce", "Salt to taste"],
    ])
    expect(
      tikka.steps.map((s: { section: string | null; text: string }) => [
        s.section,
        s.text,
      ])
    ).toEqual([
      [null, "Marinate the chicken for 1 hour."],
      ["Cook", "Simmer in the sauce."],
    ])

    const toast = (await t.admin.get("/api/recipes/toast")).body.recipe
    expect(toast).toMatchObject({
      servings: 2,
      cookMinutes: 5,
      rating: null,
      imageUrl: null,
    })
    expect(toast.ingredients[0].text).toBe("2 slices bread")
  })

  test("skips what's already here when run again", async () => {
    await t.admin.post("/api/import/mealie", { url: MEALIE, token: TOKEN })
    const job = await finished()
    expect(job).toMatchObject({ imported: 0, skipped: 2, failed: 1 })
    const check = await t.admin.post("/api/import/mealie/check", {
      url: MEALIE,
      token: TOKEN,
    })
    expect(check.body.alreadyImported).toBe(2)
    // Only ever talks to the address it was given.
    expect(requested.every((url) => url.startsWith(MEALIE))).toBe(true)
  })
})

describe("parseMealieTime", () => {
  test.each([
    ["1 hour 30 minutes", 90],
    ["1 Hour", 60],
    ["45 min", 45],
    ["1.5 hours", 90],
    ["PT25M", 25],
    ["90", 90],
    [15, 15],
    ["", null],
    ["overnight", null],
    [null, null],
  ])("%s → %s", (value, minutes) => {
    expect(parseMealieTime(value)).toBe(minutes)
  })
})
