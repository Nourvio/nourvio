import type { PhotoLibrary, Recipe } from "@mise/shared"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import type { AiProviderFactory } from "../ai/types.ts"
import { createTestAppWithAdmin } from "../test/helpers.ts"

/**
 * OpenAI makes a plain grey picture and keeps the prompts; Claude can't make
 * images. `hold()` keeps the next pictures waiting until it's let go.
 */
function fakeImages() {
  const prompts: string[] = []
  let gate: Promise<void> | null = null
  function hold() {
    let release!: () => void
    gate = new Promise((resolve) => (release = resolve))
    return () => {
      gate = null
      release()
    }
  }
  const factory: AiProviderFactory = (id) => ({
    id,
    async listModels() {
      return []
    },
    async extract() {
      throw new Error("Not used here")
    },
    ...(id === "openai"
      ? {
          async generateImage(prompt: string) {
            prompts.push(prompt)
            await gate
            const image = await sharp({
              create: {
                width: 1536,
                height: 1024,
                channels: 3,
                background: "#333333",
              },
            })
              .jpeg()
              .toBuffer()
            return {
              image,
              model: "gpt-image-2.5-flare",
              usage: { inputTokens: 300, outputTokens: 1600 },
            }
          },
        }
      : {}),
  })
  return { prompts, factory, hold }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("AI photos", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const images = fakeImages()

  const recipe = async (body: Record<string, unknown>) =>
    (await t.admin.post("/api/recipes", body)).body.recipe as Recipe
  const makePhoto = (id: string) => t.admin.post(`/api/recipes/${id}/photo`)

  beforeAll(async () => {
    t = await createTestAppWithAdmin({ aiFactory: images.factory })
    await t.admin.put("/api/ai/settings", {
      keys: { anthropic: "sk-ant-test-key-1234" },
    })
  })
  afterAll(() => t.close())

  test("needs an OpenAI key", async () => {
    const r = await recipe({ name: "Toast", ingredients: ["1 slice bread"] })
    const res = await makePhoto(r.id)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/OpenAI key/)
    expect((await t.admin.get("/api/ai/status")).body.images).toBe(false)
    expect((await t.admin.get("/api/photos/library")).body.available).toBe(
      false
    )
  })

  test("makes a photo in the house style, marked as AI", async () => {
    await t.admin.put("/api/ai/settings", {
      keys: { openai: "sk-openai-test-key-1234" },
    })
    expect((await t.admin.get("/api/ai/status")).body.images).toBe(true)
    const r = await recipe({
      name: "Chicken Teriyaki",
      description: "Sticky, glossy and quick.",
      ingredients: [
        "1 lb chicken thighs",
        "1/4 cup soy sauce",
        "1 tsp kosher salt",
      ],
      steps: ["Cook the chicken.", "Glaze it and serve over rice."],
    })
    const res = await makePhoto(r.id)
    expect(res.status).toBe(200)
    expect(res.body.recipe.imageUrl).toMatch(/^\/api\/images\/[a-z0-9]{24}/)
    expect(res.body.recipe.photoByAi).toBe(true)

    const prompt = images.prompts.at(-1)!
    expect(prompt).toContain("Chicken Teriyaki")
    expect(prompt).toContain("Sticky, glossy and quick.")
    expect(prompt).toContain("chicken thighs")
    expect(prompt).not.toContain("kosher salt")
    expect(prompt).toContain("serve over rice")
    expect(prompt).toContain("matte charcoal-black stoneware: a plate")
    expect(prompt).toContain("white Carrara marble")

    // Counted against the server's spending, with a cost.
    const usage = (await t.admin.get("/api/ai/settings/usage")).body.usage
    expect(
      usage.find(
        (row: { model: string }) => row.model === "gpt-image-2.5-flare"
      )?.costUsd
    ).toBeGreaterThan(0)

    // Another go replaces the AI photo.
    const again = await makePhoto(r.id)
    expect(again.body.recipe.imageUrl).not.toBe(res.body.recipe.imageUrl)
    expect(again.body.recipe.photoByAi).toBe(true)
  })

  test("leaves a real photo alone, and a new one isn't marked as AI", async () => {
    const r = await recipe({ name: "Pancakes", ingredients: ["1 cup flour"] })
    await makePhoto(r.id)
    const png = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#aa7744" },
    })
      .png()
      .toBuffer()
    const uploaded = await t.admin.upload(
      `/api/recipes/${r.id}/image`,
      "image",
      new File([new Uint8Array(png)], "photo.png", { type: "image/png" })
    )
    expect(uploaded.body.recipe.photoByAi).toBe(false)
    const res = await makePhoto(r.id)
    expect(res.status).toBe(409)
  })

  test("makes photos for the whole library", async () => {
    const before = (await t.admin.get("/api/photos/library"))
      .body as PhotoLibrary
    expect(before.available).toBe(true)
    expect(before.missing).toBe(1) // Toast
    const started = await t.admin.post("/api/photos/library")
    expect(started.status).toBe(201)
    let status = before
    for (let i = 0; i < 100; i++) {
      status = (await t.admin.get("/api/photos/library")).body
      if (status.job && status.job.status !== "running") break
      await sleep(20)
    }
    expect(status.job).toMatchObject({ status: "done", done: 1, failed: 0 })
    expect(status.missing).toBe(0)
    expect((await t.admin.post("/api/photos/library")).status).toBe(400)
  })

  test("new recipes get a photo when the server allows", async () => {
    const auto = await createTestAppWithAdmin({
      aiFactory: images.factory,
      autoPhotos: true,
    })
    try {
      await auto.admin.put("/api/ai/settings", {
        keys: { openai: "sk-openai-test-key-1234" },
      })
      expect((await auto.admin.get("/api/ai/settings")).body.autoPhotos).toBe(
        true
      )
      const release = images.hold()
      const soup = (
        await auto.admin.post("/api/recipes", {
          name: "Tomato Soup",
          ingredients: ["2 lb tomatoes"],
        })
      ).body.recipe as Recipe
      // The page can tell one is on its way.
      expect(
        (await auto.admin.get(`/api/recipes/${soup.id}/photo`)).body.making
      ).toBe(true)
      release()
      let photo: string | null = null
      for (let i = 0; i < 100 && !photo; i++) {
        await sleep(20)
        photo = (await auto.admin.get(`/api/recipes/${soup.id}`)).body.recipe
          .imageUrl
      }
      expect(photo).toBeTruthy()
      expect(
        (await auto.admin.get(`/api/recipes/${soup.id}/photo`)).body.making
      ).toBe(false)

      // Turned off, new recipes are left as they are.
      await auto.admin.put("/api/ai/settings", { autoPhotos: false })
      expect((await auto.admin.get("/api/ai/settings")).body.autoPhotos).toBe(
        false
      )
      const salad = (
        await auto.admin.post("/api/recipes", {
          name: "Salad",
          ingredients: ["1 head lettuce"],
        })
      ).body.recipe as Recipe
      await sleep(200)
      expect(
        (await auto.admin.get(`/api/recipes/${salad.id}`)).body.recipe.imageUrl
      ).toBeNull()
    } finally {
      await auto.close()
    }
  })
})
