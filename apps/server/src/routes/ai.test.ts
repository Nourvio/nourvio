import { DEFAULT_MODELS, type AiProviderId } from "@mise/shared"
import sharp from "sharp"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"

import type { AiProviderFactory, ExtractRequest } from "../ai/types.ts"
import { settings } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import type { ExtractedRecipe } from "../import/ai-extract.ts"
import type { Fetcher } from "../import/safe-fetch.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

const SHAKSHUKA: ExtractedRecipe = {
  found: true,
  name: "Shakshuka",
  description: "Eggs poached in a spiced tomato sauce.",
  servings: 4,
  yieldText: null,
  prepMinutes: 10,
  cookMinutes: 25,
  totalMinutes: 35,
  ingredients: ["2 tbsp olive oil", "1 onion, diced", "6 eggs"],
  steps: ["Soften the onion in the oil.", "Crack in the eggs and cover."],
  tags: ["Breakfast", "vegetarian", "breakfast"],
  notes: null,
}

const ANTHROPIC_KEY = "sk-ant-test-key-1234"
const OPENAI_KEY = "sk-openai-test-key-5678"

type Call = {
  provider: AiProviderId
  apiKey: string
  request: ExtractRequest<never>
}

/** A pretend Claude and OpenAI. Answers come from `next`; every call is recorded. */
function fakeAi() {
  const state = {
    calls: [] as Call[],
    next: SHAKSHUKA as ExtractedRecipe,
  }
  const factory: AiProviderFactory = (provider, apiKey) => ({
    id: provider,
    async extract(request) {
      state.calls.push({ provider, apiKey, request: request as never })
      return {
        data: state.next as never,
        usage: { inputTokens: 1000, outputTokens: 200 },
      }
    },
    async listModels() {
      if (apiKey.includes("bad")) {
        throw new HttpError(502, "The key was rejected")
      }
      return [{ provider, id: DEFAULT_MODELS[provider], name: "Model" }]
    },
  })
  return { state, factory }
}

describe("AI", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  let ai: ReturnType<typeof fakeAi>
  let member: ReturnType<typeof apiClient>

  const pages: Record<string, { contentType: string; body: Buffer }> = {}
  const fetcher: Fetcher = async (url) => {
    const page = pages[url]
    if (!page) throw new HttpError(502, "Couldn't reach that site")
    return { url, ...page }
  }

  beforeAll(async () => {
    ai = fakeAi()
    t = await createTestAppWithAdmin({ aiFactory: ai.factory, fetcher })
    await t.admin.post("/api/users", {
      displayName: "Sam",
      username: "sam",
      password: "another long password",
    })
    member = apiClient(t.app)
    await member.post("/api/auth/login", {
      username: "sam",
      password: "another long password",
    })
  })
  afterAll(() => t.close())
  afterEach(() => {
    delete process.env.OPENAI_API_KEY
    ai.state.next = SHAKSHUKA
  })

  test("is off until a key is added", async () => {
    const status = await member.get("/api/ai/status")
    expect(status.body).toEqual({
      available: false,
      providers: [],
      transcription: false,
      usda: false,
    })
    const res = await member.post("/api/import/text", {
      text: "Shakshuka: onions, tomatoes, eggs. Cook it all.",
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/AI isn't set up/)
  })

  test("only admins see and change the settings", async () => {
    expect((await member.get("/api/ai/settings")).status).toBe(403)
    expect(
      (await member.put("/api/ai/settings", { defaultModel: null })).status
    ).toBe(403)
  })

  test("saves keys encrypted and only shows a hint", async () => {
    const res = await t.admin.put("/api/ai/settings", {
      keys: { anthropic: ANTHROPIC_KEY },
    })
    expect(res.status).toBe(200)
    expect(res.body.keys.anthropic).toEqual({
      configured: true,
      source: "settings",
      hint: "…1234",
    })
    expect(res.body.keys.openai.configured).toBe(false)

    const [row] = await t.db.select().from(settings)
    expect(JSON.stringify(row!.value)).not.toContain(ANTHROPIC_KEY)

    const status = await member.get("/api/ai/status")
    expect(status.body.available).toBe(true)
    expect(status.body.transcription).toBe(false)
  })

  test("a key set on the server wins and can't be changed here", async () => {
    process.env.OPENAI_API_KEY = OPENAI_KEY
    const res = await t.admin.get("/api/ai/settings")
    expect(res.body.keys.openai).toEqual({
      configured: true,
      source: "env",
      hint: "…5678",
    })
    expect((await member.get("/api/ai/status")).body.transcription).toBe(true)
  })

  test("tests a key before it's saved", async () => {
    const good = await t.admin.post("/api/ai/settings/test", {
      provider: "openai",
      key: "sk-good-key-0000",
    })
    expect(good.status).toBe(200)
    expect(good.body.models).toBe(1)
    const bad = await t.admin.post("/api/ai/settings/test", {
      provider: "openai",
      key: "sk-bad-key-0000",
    })
    expect(bad.status).toBe(502)
  })

  test("imports pasted text and records usage", async () => {
    const before = ai.state.calls.length
    const res = await member.post("/api/import/text", {
      text: "Shakshuka for 4. 2 tbsp olive oil, 1 onion, 6 eggs. Soften, crack, cover.",
    })
    expect(res.status).toBe(201)
    expect(res.body.recipe).toMatchObject({
      name: "Shakshuka",
      origin: "text",
      servings: 4,
      totalMinutes: 35,
      tags: ["breakfast", "vegetarian"],
    })
    expect(res.body.recipe.ingredients[0]).toMatchObject({
      quantity: 2,
      unitId: "tablespoon",
      food: "olive oil",
    })

    const call = ai.state.calls[before]!
    expect(call.provider).toBe("anthropic")
    expect(call.apiKey).toBe(ANTHROPIC_KEY)
    expect(call.request.model).toBe("claude-opus-5-5")
    expect(call.request.parts[0]).toMatchObject({ type: "text" })

    const usage = await t.admin.get("/api/ai/settings/usage")
    expect(usage.body.usage[0]).toMatchObject({
      provider: "anthropic",
      model: "claude-opus-5-5",
      requests: 1,
      inputTokens: 1000,
      outputTokens: 200,
    })
    // $4 and $20 per million tokens.
    expect(usage.body.usage[0].costUsd).toBeCloseTo(0.008)
  })

  test("uses the task's model when its provider has a key", async () => {
    await t.admin.put("/api/ai/settings", {
      taskModels: { import: "openai:gpt-6-luna" },
    })
    const text = { text: "Shakshuka: 2 tbsp oil, 6 eggs. Cook it." }

    // No OpenAI key: falls back to the provider that has one.
    await member.post("/api/import/text", text)
    expect(ai.state.calls.at(-1)!.provider).toBe("anthropic")

    process.env.OPENAI_API_KEY = OPENAI_KEY
    await member.post("/api/import/text", text)
    expect(ai.state.calls.at(-1)).toMatchObject({
      provider: "openai",
      apiKey: OPENAI_KEY,
      request: { model: "gpt-6-luna" },
    })
    await t.admin.put("/api/ai/settings", { taskModels: { import: null } })
  })

  test("says so when there's no recipe in the text", async () => {
    ai.state.next = { ...SHAKSHUKA, found: false, ingredients: [], steps: [] }
    const res = await member.post("/api/import/text", {
      text: "Dear diary, today I went to the market and bought nothing.",
    })
    expect(res.status).toBe(422)
  })

  test("reads photos, shrunk to JPEG", async () => {
    const png = await sharp({
      create: { width: 3000, height: 4000, channels: 3, background: "#eee" },
    })
      .png()
      .toBuffer()
    const res = await member.upload(
      "/api/import/photo",
      "photos",
      new File([new Uint8Array(png)], "page.png", { type: "image/png" })
    )
    expect(res.status).toBe(201)
    expect(res.body.recipe.origin).toBe("photo")
    const image = ai.state.calls.at(-1)!.request.parts[0]!
    expect(image).toMatchObject({ type: "image", mediaType: "image/jpeg" })
    const meta = await sharp(
      Buffer.from((image as { data: string }).data, "base64")
    ).metadata()
    expect(meta.height).toBe(1600)
  })

  test("reads pages without recipe data", async () => {
    const jpeg = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#c84" },
    })
      .jpeg()
      .toBuffer()
    pages["https://blog.example/shakshuka"] = {
      contentType: "text/html",
      body: Buffer.from(`<html><head><title>My shakshuka</title>
        <meta property="og:image" content="/img/shakshuka.jpg"></head>
        <body><nav>Home | About</nav><article><h1>Shakshuka</h1>
        <ul><li>2 tbsp olive oil</li><li>6 eggs</li></ul>
        <p>Crack the eggs into the sauce.</p></article>
        <script>trackEverything()</script></body></html>`),
    }
    pages["https://blog.example/img/shakshuka.jpg"] = {
      contentType: "image/jpeg",
      body: jpeg,
    }
    const res = await member.post("/api/import/url", {
      url: "https://blog.example/shakshuka",
    })
    expect(res.status).toBe(201)
    expect(res.body.recipe).toMatchObject({
      origin: "url",
      sourceUrl: "https://blog.example/shakshuka",
    })
    expect(res.body.recipe.imageUrl).toBeTruthy()

    const text = (ai.state.calls.at(-1)!.request.parts[0] as { text: string })
      .text
    expect(text).toContain("2 tbsp olive oil\n6 eggs")
    expect(text).not.toContain("Home | About")
    expect(text).not.toContain("trackEverything")
  })

  test("lists models from every provider with a key", async () => {
    process.env.OPENAI_API_KEY = OPENAI_KEY
    await t.admin.put("/api/ai/settings", { defaultModel: null })
    const res = await t.admin.get("/api/ai/settings/models")
    expect(
      res.body.models.map((m: { provider: string }) => m.provider).sort()
    ).toEqual(["anthropic", "openai"])
  })

  test("removes a saved key", async () => {
    const res = await t.admin.put("/api/ai/settings", {
      keys: { anthropic: null },
    })
    expect(res.body.keys.anthropic.configured).toBe(false)
    expect((await member.get("/api/ai/status")).body.available).toBe(false)
  })
})
