import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

const PANCAKES = {
  name: "Buttermilk Pancakes",
  description: "Fluffy weekend pancakes.",
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 15,
  totalMinutes: 25,
  tags: ["Breakfast", "weekend", "breakfast"],
  ingredients: [
    "# Dry",
    "2 cups all-purpose flour",
    "2 tbsp sugar",
    "# Wet",
    "2 cups buttermilk",
    "2 large eggs",
  ],
  steps: [
    "Whisk the dry ingredients.",
    "Whisk in the wet ingredients.",
    "Cook on a hot griddle.",
  ],
}

describe("recipes", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>

  beforeAll(async () => {
    t = await createTestAppWithAdmin()
  })
  afterAll(() => t.close())

  test("creates a recipe, parsing ingredients and keeping sections", async () => {
    const res = await t.admin.post("/api/recipes", PANCAKES)
    expect(res.status).toBe(201)
    const recipe = res.body.recipe
    expect(recipe).toMatchObject({
      slug: "buttermilk-pancakes",
      name: "Buttermilk Pancakes",
      origin: "manual",
      servings: 4,
      tags: ["Breakfast", "weekend"],
    })
    expect(recipe.ingredients[0]).toMatchObject({
      section: "Dry",
      text: "2 cups all-purpose flour",
      quantity: 2,
      unitId: "cup",
      food: "all-purpose flour",
    })
    expect(recipe.ingredients[2].section).toBe("Wet")
    expect(recipe.steps.map((s: { text: string }) => s.text)).toEqual(
      PANCAKES.steps
    )

    const bySlug = await t.admin.get("/api/recipes/buttermilk-pancakes")
    expect(bySlug.body.recipe.id).toBe(recipe.id)
  })

  test("gives a second recipe with the same name its own slug", async () => {
    const res = await t.admin.post("/api/recipes", { ...PANCAKES, tags: [] })
    expect(res.body.recipe.slug).toBe("buttermilk-pancakes-2")
    await t.admin.delete(`/api/recipes/${res.body.recipe.id}`)
  })

  test("lists, searches and filters by tag", async () => {
    await t.admin.post("/api/recipes", {
      name: "Weeknight Chili",
      tags: ["dinner"],
      ingredients: ["1 lb ground beef", "1 can kidney beans"],
      steps: ["Brown the beef.", "Simmer everything."],
    })
    const all = await t.admin.get("/api/recipes")
    expect(all.body.recipes.map((r: { name: string }) => r.name)).toEqual([
      "Weeknight Chili",
      "Buttermilk Pancakes",
    ])

    const search = (q: string) =>
      t.admin
        .get(`/api/recipes?q=${encodeURIComponent(q)}`)
        .then((r) => r.body.recipes.map((x: { name: string }) => x.name))
    expect(await search("kidney")).toEqual(["Weeknight Chili"])
    expect(await search("fluffy")).toEqual(["Buttermilk Pancakes"])
    expect(await search("BREAKFAST")).toEqual(["Buttermilk Pancakes"])
    expect(await search("100%")).toEqual([])

    const tagged = await t.admin.get("/api/recipes?tag=dinner")
    expect(tagged.body.recipes).toHaveLength(1)

    const tags = await t.admin.get("/api/recipes/tags")
    expect(tags.body.tags).toEqual(
      expect.arrayContaining([
        { name: "Breakfast", count: 1 },
        { name: "dinner", count: 1 },
      ])
    )
  })

  test("editing keeps history, and an old version can be restored", async () => {
    const created = (await t.admin.get("/api/recipes/buttermilk-pancakes")).body
      .recipe
    const edited = await t.admin.put(`/api/recipes/${created.id}`, {
      ...PANCAKES,
      name: "Best Buttermilk Pancakes",
      ingredients: ["3 cups flour"],
    })
    expect(edited.status).toBe(200)
    expect(edited.body.recipe.slug).toBe("best-buttermilk-pancakes")
    expect(edited.body.recipe.ingredients).toHaveLength(1)

    const versions = (await t.admin.get(`/api/recipes/${created.id}/versions`))
      .body.versions
    expect(versions.map((v: { source: string }) => v.source)).toEqual([
      "edit",
      "create",
    ])

    const original = versions[1].id
    const restored = await t.admin.post(
      `/api/recipes/${created.id}/versions/${original}/restore`
    )
    expect(restored.body.recipe.name).toBe("Buttermilk Pancakes")
    expect(restored.body.recipe.ingredients).toHaveLength(4)
  })

  test("rates, marks as made and validates input", async () => {
    const { id } = (await t.admin.get("/api/recipes/buttermilk-pancakes")).body
      .recipe
    const rated = await t.admin.patch(`/api/recipes/${id}`, { rating: 5 })
    expect(rated.body.recipe.rating).toBe(5)
    expect(
      (await t.admin.patch(`/api/recipes/${id}`, { rating: 9 })).status
    ).toBe(400)

    const made = await t.admin.post(`/api/recipes/${id}/made`)
    expect(made.body.recipe.lastMadeAt).toBeTruthy()

    const invalid = await t.admin.post("/api/recipes", { name: "  " })
    expect(invalid.status).toBe(400)
    expect(invalid.body.fields.name).toBeTruthy()
    expect((await t.admin.get("/api/recipes/nope")).status).toBe(404)
  })

  test("stores an uploaded photo as a resized image and thumbnail", async () => {
    const { id } = (await t.admin.get("/api/recipes/buttermilk-pancakes")).body
      .recipe
    const png = await sharp({
      create: { width: 2400, height: 1800, channels: 3, background: "#356844" },
    })
      .png()
      .toBuffer()
    const res = await t.admin.upload(
      `/api/recipes/${id}/image`,
      "image",
      new File([new Uint8Array(png)], "photo.png", { type: "image/png" })
    )
    expect(res.status).toBe(200)
    const { imageUrl, thumbnailUrl } = res.body.recipe
    expect(imageUrl).toMatch(/^\/api\/images\/[a-z0-9]{24}\.webp$/)

    const image = await t.app.request(imageUrl, {
      headers: { cookie: await signInCookie(t) },
    })
    expect(image.status).toBe(200)
    const meta = await sharp(Buffer.from(await image.arrayBuffer())).metadata()
    expect(meta).toMatchObject({ format: "webp", width: 1600 })

    const thumb = await t.app.request(thumbnailUrl, {
      headers: { cookie: await signInCookie(t) },
    })
    const thumbMeta = await sharp(
      Buffer.from(await thumb.arrayBuffer())
    ).metadata()
    expect(thumbMeta).toMatchObject({ width: 640, height: 480 })

    expect((await apiClient(t.app).get(imageUrl)).status).toBe(401)

    const notImage = await t.admin.upload(
      `/api/recipes/${id}/image`,
      "image",
      new File(["hello"], "notes.txt", { type: "text/plain" })
    )
    expect(notImage.status).toBe(400)
  })

  test("deleting a recipe removes it", async () => {
    const chili = (await t.admin.get("/api/recipes?q=chili")).body.recipes[0]
    expect((await t.admin.delete(`/api/recipes/${chili.id}`)).status).toBe(204)
    expect((await t.admin.get(`/api/recipes/${chili.id}`)).status).toBe(404)
  })
})

/** A session cookie for raw requests (images aren't JSON, so they skip apiClient). */
async function signInCookie(
  t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
) {
  const res = await t.app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "kyle",
      password: "correct horse battery",
    }),
  })
  return res.headers.get("set-cookie")!.split(";")[0]!
}
