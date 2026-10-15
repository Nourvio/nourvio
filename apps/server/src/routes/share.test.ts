import type { Recipe, ShareResult } from "@mise/shared"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import type { AiProviderFactory } from "../ai/types.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

/** What the fake model says the next shared thing is. */
let next: "receipt" | "recipe" | "other" = "receipt"

const aiFactory: AiProviderFactory = (id) => ({
  id,
  async extract(request) {
    const usage = { inputTokens: 500, outputTokens: 100 }
    if (request.schemaName === "receipt") {
      return {
        data: {
          what: next,
          store: next === "receipt" ? "Fry's" : null,
          date: null,
          total: null,
          items:
            next === "receipt"
              ? [
                  {
                    text: "KRO 2% MLK",
                    name: "2% milk",
                    amount: "1 gal",
                    price: 3.49,
                    kind: "food",
                  },
                ]
              : [],
        },
        usage,
      } as never
    }
    // Reading a recipe from the shared screenshot.
    return {
      data: {
        found: true,
        name: "Weeknight Tacos",
        description: null,
        servings: 4,
        yieldText: null,
        prepMinutes: 10,
        cookMinutes: 15,
        totalMinutes: 25,
        ingredients: ["1 lb ground beef", "8 tortillas"],
        steps: ["Brown the beef.", "Fill the tortillas."],
        tags: ["dinner"],
        notes: null,
      },
      usage,
    } as never
  },
  async listModels() {
    return []
  },
})

describe("sharing anything into Mise", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  let picture: File

  const shareFile = (file: File) => t.admin.upload("/api/share", "file", file)
  const open = async (url: string) => {
    const id = new URL(url).searchParams.get("inbox")!
    const res = await t.admin.post(`/api/share/${id}`, {})
    expect(res.status).toBe(200)
    return res.body.result as ShareResult
  }

  beforeAll(async () => {
    t = await createTestAppWithAdmin({ aiFactory })
    await t.admin.put("/api/ai/settings", {
      keys: { anthropic: "sk-ant-test-key-1234" },
    })
    const png = await sharp({
      create: { width: 400, height: 500, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer()
    picture = new File([png], "shared.png", { type: "image/png" })
  })
  afterAll(() => t.close())

  test("a video link goes straight to importing it", async () => {
    const res = await t.admin.post("/api/share", {
      text: "Check out this recipe! https://www.tiktok.com/@cook/video/123?lang=en",
    })
    expect(res.status).toBe(201)
    expect(res.body.url).toMatch(
      /\/share\?link=https%3A%2F%2Fwww\.tiktok\.com%2F%40cook%2Fvideo%2F123%3Flang%3Den$/
    )
  })

  test("a long receipt that mentions a website isn't a link", async () => {
    next = "receipt"
    const text = `FRY'S FOOD STORES\n${"KRO 2% MLK 1GAL 3.49\n".repeat(20)}Track your order at https://www.frysfood.com/orders`
    const res = await t.admin.post("/api/share", { text })
    expect(res.body.url).toMatch(/\/share\?inbox=/)
    expect(await open(res.body.url)).toMatchObject({ kind: "receipt" })
  })

  test("a receipt photo opens its review", async () => {
    next = "receipt"
    const res = await shareFile(picture)
    const result = await open(res.body.url)
    expect(result.kind).toBe("receipt")
    const draft = await t.admin.get(
      `/api/receipts/${(result as { id: string }).id}`
    )
    expect(draft.body.draft.items[0].name).toBe("2% milk")
  })

  test("a screenshot of a recipe becomes a recipe", async () => {
    next = "recipe"
    const result = await open((await shareFile(picture)).body.url)
    expect(result).toEqual({
      kind: "recipe",
      slug: "weeknight-tacos",
      name: "Weeknight Tacos",
    })
    const recipe = (await t.admin.get("/api/recipes/weeknight-tacos")).body
      .recipe as Recipe
    expect(recipe.ingredients.map((i) => i.text)).toEqual([
      "1 lb ground beef",
      "8 tortillas",
    ])
  })

  test("something else says so", async () => {
    next = "other"
    expect(await open((await shareFile(picture)).body.url)).toEqual({
      kind: "unknown",
    })
  })

  test("a share is opened once, and only by its household", async () => {
    next = "receipt"
    const url = (await shareFile(picture)).body.url as string
    const id = new URL(url).searchParams.get("inbox")
    await t.admin.put("/api/server/settings", { signupOpen: true })
    const neighbor = apiClient(t.app)
    await neighbor.post("/api/signup", {
      householdName: "Next Door",
      displayName: "Dana",
      username: "dana",
      password: "correct horse battery",
    })
    expect((await neighbor.post(`/api/share/${id}`, {})).status).toBe(404)
    expect((await t.admin.post(`/api/share/${id}`, {})).status).toBe(200)
    expect((await t.admin.post(`/api/share/${id}`, {})).status).toBe(404)
    expect((await t.admin.post("/api/share", {})).status).toBe(400)
  })

  test("from a Shortcut, the link signs a fresh browser in, once", async () => {
    next = "receipt"
    const { token } = (
      await t.admin.post("/api/extension/tokens", { name: "iPhone Shortcut" })
    ).body as { token: string }
    const form = new FormData()
    form.append("file", picture)
    const shared = await t.app.request("/api/share", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    })
    const { url } = (await shared.json()) as { url: string }
    expect(url).toMatch(/\/s\/[\w-]{40,}$/)

    // A browser that has never signed in opens it.
    const path = new URL(url).pathname
    const opened = await t.app.request(path)
    expect(opened.status).toBe(302)
    const goesTo = opened.headers.get("location")!
    expect(goesTo).toMatch(/^\/share\?inbox=/)
    const cookie = opened.headers.get("set-cookie")!.split(";")[0]!
    expect(cookie).toMatch(/^mise_session=/)

    // Signed in now: it can open what was shared.
    const id = new URLSearchParams(goesTo.split("?")[1]).get("inbox")
    const result = await t.app.request(`/api/share/${id}`, {
      method: "POST",
      headers: { cookie, origin: "http://localhost" },
    })
    expect(result.status).toBe(200)

    // Used once: opening it again just asks to sign in.
    const again = await t.app.request(path)
    expect(again.headers.get("location")).toBe("/login")
    expect(again.headers.get("set-cookie")).toBeNull()

    // From Mise itself, signed in, no sign-in link is needed.
    const own = await t.admin.post("/api/share", {
      text: "https://example.com/r",
    })
    expect(own.body.url).not.toMatch(/\/s\//)
  })
})
