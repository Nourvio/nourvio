import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { HttpError } from "../http.ts"
import type { FetchedResource, Fetcher } from "../import/safe-fetch.ts"
import { createTestAppWithAdmin } from "../test/helpers.ts"

const RECIPE_PAGE = `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Weeknight Chili",
  image: "https://food.example/chili.jpg",
  recipeYield: "6",
  totalTime: "PT50M",
  keywords: "beef, chili",
  recipeIngredient: ["1 lb ground beef", "1 (15 oz) can kidney beans"],
  recipeInstructions: [
    { "@type": "HowToStep", text: "Brown the beef." },
    { "@type": "HowToStep", text: "Add the beans and simmer." },
  ],
})}</script></head><body></body></html>`

/** A pretend internet: link → response. Anything else fails like an unreachable site. */
function fakeFetcher(pages: Record<string, Partial<FetchedResource>>) {
  const calls: string[] = []
  const fetcher: Fetcher = async (url) => {
    calls.push(url)
    const page = pages[url]
    if (!page) throw new HttpError(502, "Couldn't reach that site")
    return {
      url: page.url ?? url,
      contentType: page.contentType ?? "text/html; charset=utf-8",
      body: page.body ?? Buffer.alloc(0),
    }
  }
  return { fetcher, calls }
}

describe("import from a link", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  let calls: string[]

  beforeAll(async () => {
    const jpeg = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#a33" },
    })
      .jpeg()
      .toBuffer()
    const fake = fakeFetcher({
      "https://food.example/chili": { body: Buffer.from(RECIPE_PAGE) },
      "https://food.example/chili.jpg": {
        contentType: "image/jpeg",
        body: jpeg,
      },
      "https://short.example/c": {
        url: "https://food.example/chili",
        body: Buffer.from(RECIPE_PAGE),
      },
      "https://food.example/blog-post": {
        body: Buffer.from("<html><body><p>Just a story</p></body></html>"),
      },
      "https://food.example/file.pdf": { contentType: "application/pdf" },
    })
    calls = fake.calls
    t = await createTestAppWithAdmin({ fetcher: fake.fetcher })
  })
  afterAll(() => t.close())

  test("creates a recipe with its photo from the page's recipe data", async () => {
    const res = await t.admin.post("/api/import/url", {
      url: "https://food.example/chili?utm_source=pinterest#recipe",
    })
    expect(res.status).toBe(201)
    expect(res.body.duplicate).toBe(false)
    const recipe = res.body.recipe
    expect(recipe).toMatchObject({
      name: "Weeknight Chili",
      origin: "url",
      sourceUrl: "https://food.example/chili",
      servings: 6,
      totalMinutes: 50,
      tags: ["beef", "chili"],
    })
    expect(recipe.ingredients[1]).toMatchObject({
      quantity: 1,
      unitId: "can",
      food: "kidney beans",
      note: "15 oz",
    })
    expect(recipe.steps.map((s: { text: string }) => s.text)).toEqual([
      "Brown the beef.",
      "Add the beans and simmer.",
    ])
    expect(recipe.imageUrl).toMatch(/^\/api\/images\/[a-z0-9]{24}\.webp$/)
  })

  test("returns the existing recipe when the link was imported before", async () => {
    const before = calls.length
    const res = await t.admin.post("/api/import/url", {
      url: "https://food.example/chili",
    })
    expect(res.status).toBe(200)
    expect(res.body.duplicate).toBe(true)
    expect(res.body.recipe.slug).toBe("weeknight-chili")
    expect(calls.length).toBe(before)

    // A short link that redirects to the same page counts too.
    const short = await t.admin.post("/api/import/url", {
      url: "https://short.example/c",
    })
    expect(short.body.duplicate).toBe(true)
  })

  test("imports again when asked to", async () => {
    const res = await t.admin.post("/api/import/url", {
      url: "https://food.example/chili",
      force: true,
    })
    expect(res.status).toBe(201)
    expect(res.body.recipe.slug).toBe("weeknight-chili-2")
  })

  test("explains what went wrong", async () => {
    const noRecipe = await t.admin.post("/api/import/url", {
      url: "https://food.example/blog-post",
    })
    expect(noRecipe.status).toBe(422)
    expect(noRecipe.body.error).toMatch(/doesn't include recipe data/)

    const pdf = await t.admin.post("/api/import/url", {
      url: "https://food.example/file.pdf",
    })
    expect(pdf.status).toBe(422)

    const unreachable = await t.admin.post("/api/import/url", {
      url: "https://nowhere.example/",
    })
    expect(unreachable.status).toBe(502)

    const notALink = await t.admin.post("/api/import/url", { url: "chili" })
    expect(notALink.status).toBe(400)
    expect(notALink.body.fields.url).toBeTruthy()
  })

  test("needs a signed-in user", async () => {
    const res = await t.app.request("/api/import/url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://food.example/chili" }),
    })
    expect(res.status).toBe(401)
  })
})
