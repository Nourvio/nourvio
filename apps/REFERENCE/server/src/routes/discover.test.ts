import type { Discovery } from "@mise/shared"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import type { AiProviderFactory, ChatToolCall } from "../ai/types.ts"
import { HttpError } from "../http.ts"
import type { Fetcher } from "../import/safe-fetch.ts"
import { spread } from "../services/discover.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

const recipePage = (name: string, image: string) =>
  `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "Recipe",
      name,
      image,
      totalTime: "PT35M",
      recipeIngredient: ["1 lb potatoes", "4 cups stock"],
      recipeInstructions: [{ "@type": "HowToStep", text: "Simmer." }],
    }
  )}</script></head><body></body></html>`

const pick = (slug: string, site = "Good Site") => ({
  url: `https://good.example/${slug}`,
  title: slug,
  site,
  why: `Why ${slug}`,
})

type Step = { tools?: ChatToolCall[]; text?: string } | Error

/** A pretend model that can search: each turn plays the next scripted step. */
function fakeSearcher() {
  const state = {
    script: [] as Step[],
    seen: [] as { model: string; history: unknown[]; webSearch: boolean }[],
    gate: null as Promise<void> | null,
  }
  const factory: AiProviderFactory = (id) => ({
    id,
    async extract() {
      throw new Error("not used")
    },
    async listModels() {
      return []
    },
    chat: {
      async turn({ model, history, webSearch }) {
        state.seen.push({
          model,
          history: structuredClone(history),
          webSearch: Boolean(webSearch),
        })
        if (state.gate) await state.gate
        const step = state.script.shift() ?? { text: "Done." }
        if (step instanceof Error) throw step
        return {
          native: [{ role: "assistant", tools: step.tools ?? [] }],
          toolCalls: step.tools ?? [],
          stop: step.tools?.length ? "tool_use" : "end",
          searches: [{ id: "s1", query: "soup" }],
          usage: { inputTokens: 1000, outputTokens: 100, webSearches: 1 },
        }
      },
      userMessage: (text) => ({ role: "user", text }),
      toolResults: (results) => [{ role: "tool", results }],
      assistantText: (text) => ({ role: "assistant", text }),
    },
  })
  return { state, factory }
}

const offer = (...picks: ReturnType<typeof pick>[]): Step => ({
  tools: [{ id: "call-1", name: "offer_recipes", input: { recipes: picks } }],
})

describe("discovering recipes with AI", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const ai = fakeSearcher()
  const fetched: string[] = []

  const finished = async (id: string) => {
    for (let i = 0; i < 100; i++) {
      const res = await t.admin.get(`/api/discover/${id}`)
      const discovery = res.body.discovery as Discovery
      if (discovery.status !== "searching") return discovery
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error("Still searching")
  }

  const start = async (theme: string) => {
    const res = await t.admin.post("/api/discover", { theme })
    expect(res.status).toBe(202)
    return res.body.discovery as Discovery
  }

  beforeAll(async () => {
    const photo = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: "#963" },
    })
      .jpeg()
      .toBuffer()
    const fetcher: Fetcher = async (url, options) => {
      fetched.push(`${url} from ${options?.referer ?? "-"}`)
      if (url.endsWith(".jpg")) {
        return { url, contentType: "image/jpeg", body: photo }
      }
      if (url.includes("blocked")) throw new HttpError(502, "Blocked")
      if (url.includes("roundup")) {
        return {
          url,
          contentType: "text/html",
          body: Buffer.from("<html><body>25 soups</body></html>"),
        }
      }
      // One link redirects; the recipe is kept under where it landed.
      const landed = url.replace("/old-", "/")
      const slug = landed.split("/").pop()!
      return {
        url: landed,
        contentType: "text/html",
        body: Buffer.from(
          recipePage(`Page ${slug}`, `https://img.example/${slug}.jpg`)
        ),
      }
    }
    t = await createTestAppWithAdmin({ aiFactory: ai.factory, fetcher })
  })
  afterAll(() => t.close())

  test("needs AI set up", async () => {
    const res = await t.admin.post("/api/discover", { theme: "Soups" })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/AI isn't set up/)
    await t.admin.put("/api/ai/settings", {
      keys: { anthropic: "sk-ant-test-key-1234" },
    })
    await t.admin.put("/api/household/tastes", {
      avoid: [{ food: "mushrooms", who: null, allergy: false }],
      diets: [],
      weeknightMinutes: null,
      notes: [],
    })
  })

  test("searches, keeps the pages that read as recipes, and asks for more when too few do", async () => {
    ai.state.script.push(
      offer(
        pick("potato-soup"),
        pick("blocked-soup"),
        pick("roundup-soups"),
        pick("old-lentil-soup")
      ),
      offer(pick("potato-soup"), pick("chili"), pick("minestrone"))
    )
    const begun = await start("Cozy soups")
    expect(begun).toMatchObject({ theme: "Cozy soups", status: "searching" })

    const discovery = await finished(begun.id)
    expect(discovery.status).toBe("done")
    expect(discovery.recipes.map((r) => r.url)).toEqual([
      "https://good.example/potato-soup",
      "https://good.example/lentil-soup",
      "https://good.example/chili",
      "https://good.example/minestrone",
    ])
    expect(discovery.recipes[0]).toMatchObject({
      title: "Page potato-soup",
      site: "Good Site",
      minutes: 35,
      why: "Why potato-soup",
      imageUrl: `/api/discover/${begun.id}/0/image`,
      inLibrary: null,
    })

    // A small model, searching, told the theme and the household's rules.
    const first = ai.state.seen.at(-2)!
    expect(first.model).toBe("claude-haiku-5-5")
    expect(first.webSearch).toBe(true)
    const asked = JSON.stringify(first.history)
    expect(asked).toContain("Theme: Cozy soups")
    expect(asked).toContain("mushrooms")
    // The second round heard which ones didn't work.
    const retold = JSON.stringify(ai.state.seen.at(-1)!.history)
    expect(retold).toContain("blocked-soup")
    expect(retold).toContain("roundup-soups")

    const usage = (await t.admin.get("/api/ai/settings/usage")).body.usage as {
      model: string
      requests: number
    }[]
    expect(usage).toContainEqual(
      expect.objectContaining({ model: "claude-haiku-5-5", requests: 1 })
    )
  })

  test("says which are in the library, and serves their photos through Nourvio", async () => {
    const [latest] = (await t.admin.get("/api/discover")).body
      .discoveries as Discovery[]
    await t.admin.post("/api/import/url", {
      url: "https://good.example/chili",
    })
    const again = (await t.admin.get(`/api/discover/${latest!.id}`)).body
      .discovery as Discovery
    expect(again.recipes[2]!.inLibrary).toMatchObject({ name: "Page chili" })

    const photo = await t.admin.raw(`/api/discover/${latest!.id}/1/image`)
    expect(photo.status).toBe(200)
    expect(photo.headers.get("content-type")).toBe("image/webp")
    expect(fetched).toContain(
      "https://img.example/lentil-soup.jpg from https://good.example/lentil-soup"
    )
    expect(
      (await t.admin.raw(`/api/discover/${latest!.id}/40/image`)).status
    ).toBe(404)
  })

  test("one search at a time", async () => {
    let release = () => {}
    ai.state.gate = new Promise((resolve) => (release = resolve))
    ai.state.script.push(offer(pick("dal"), pick("curry")))
    const begun = await start("Indian")
    const second = await t.admin.post("/api/discover", { theme: "Thai" })
    expect(second.status).toBe(409)
    ai.state.gate = null
    release()
    expect((await finished(begun.id)).recipes).toHaveLength(2)
  })

  test("says when a search didn't work", async () => {
    ai.state.script.push(new HttpError(429, "OpenAI is out of credit"))
    const failed = await finished((await start("Tacos")).id)
    expect(failed).toMatchObject({
      status: "failed",
      error: "OpenAI is out of credit",
    })

    ai.state.script.push(offer(pick("blocked-one")), offer(pick("roundup-2")))
    const empty = await finished((await start("Nothing")).id)
    expect(empty.status).toBe("failed")
    expect(empty.error).toMatch(/Couldn't find recipes/)
  })

  test("keeps the latest twelve", async () => {
    for (let i = 0; i < 12; i++) {
      ai.state.script.push(offer(pick(`dish-${i}`)))
      await finished((await start(`Theme ${i}`)).id)
    }
    const list = (await t.admin.get("/api/discover")).body
      .discoveries as Discovery[]
    expect(list).toHaveLength(12)
    expect(list[0]!.theme).toBe("Theme 11")
    expect(list.map((d) => d.theme)).not.toContain("Cozy soups")
  })

  test("needs signing in", async () => {
    expect((await apiClient(t.app).get("/api/discover")).status).toBe(401)
  })
})

test("shows eight, no more than two from one site unless others run out", () => {
  const at = (host: string, n: number) => ({ url: `https://${host}/${n}` })
  const offered = [
    at("www.a.com", 1),
    at("a.com", 2),
    at("a.com", 3),
    at("b.com", 1),
    at("a.com", 4),
    at("c.com", 1),
    at("d.com", 1),
    at("e.com", 1),
    at("f.com", 1),
    at("a.com", 5),
  ]
  expect(spread(offered).map((r) => r.url)).toEqual([
    "https://www.a.com/1",
    "https://a.com/2",
    // A third from a.com fills the last place, in the order offered.
    "https://a.com/3",
    "https://b.com/1",
    "https://c.com/1",
    "https://d.com/1",
    "https://e.com/1",
    "https://f.com/1",
  ])
  expect(spread(offered.slice(0, 3))).toHaveLength(3)
})
