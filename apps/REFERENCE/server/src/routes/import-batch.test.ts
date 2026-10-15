import type {
  HouseholdEvent,
  ImportBatch,
  LinkPreview,
  RecipeSummary,
} from "@mise/shared"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createAiService } from "../ai/service.ts"
import { importBatchItems, importBatches } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import type { Fetcher } from "../import/safe-fetch.ts"
import type { VideoTools } from "../import/video-tools.ts"
import { createEventBus } from "../services/events.ts"
import { createImportBatchService } from "../services/import-batches.ts"
import { createTestAppWithAdmin } from "../test/helpers.ts"

const page = (name: string) => `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name,
  recipeIngredient: ["1 lb pasta", "2 cups tomato sauce"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Cook it." }],
})}</script></head><body></body></html>`

/** Pages that can come and go, and gates that hold a page back. */
const pages = new Map<string, string>([
  ["https://food.example/chili", page("Chili")],
  ["https://food.example/pesto", page("Pesto Pasta")],
  ["https://food.example/tacos", page("Tacos")],
  ["https://food.example/soup", page("Soup")],
])
const gates = new Map<string, Promise<void>>()

const fetcher: Fetcher = async (url) => {
  await gates.get(url)
  const body = pages.get(url)
  if (!body) throw new HttpError(502, "Couldn't reach that site")
  return {
    url,
    contentType: "text/html; charset=utf-8",
    body: Buffer.from(body),
  }
}

const videoTools: VideoTools = {
  probe: async () => {
    throw new HttpError(422, "That video is private")
  },
  download: async () => "",
  extractAudio: async () => Buffer.alloc(0),
  frames: async () => [],
}

describe("importing many links at once", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>

  const batchOf = async (id: string) =>
    (await t.admin.get(`/api/import/batch/${id}`)).body.batch as ImportBatch

  /** Until the batch is done, or a few seconds pass. */
  async function finished(id: string) {
    for (let tries = 0; tries < 100; tries++) {
      const batch = await batchOf(id)
      if (batch.finishedAt) return batch
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error("The import didn't finish")
  }

  const stateOf = (batch: ImportBatch) =>
    Object.fromEntries(batch.items.map((item) => [item.url, item.state]))

  beforeAll(async () => {
    t = await createTestAppWithAdmin({ fetcher, videoTools })
    await t.admin.post("/api/import/url", { url: "https://food.example/chili" })
  })
  afterAll(() => t.close())

  test("finds the links in pasted text, and says which are in already", async () => {
    const res = await t.admin.post("/api/import/links", {
      text: `Some to try:
- https://food.example/chili?utm_source=pinterest (we have this)
- https://food.example/pesto, and https://food.example/pesto again
https://www.tiktok.com/@cook/video/123
not a link: food.example/tacos`,
    })
    expect(res.status).toBe(200)
    expect(res.body.more).toBe(0)
    expect(res.body.links as LinkPreview[]).toEqual([
      {
        url: "https://food.example/chili",
        kind: "page",
        existing: { slug: "chili", name: "Chili" },
      },
      { url: "https://food.example/pesto", kind: "page", existing: null },
      {
        url: "https://www.tiktok.com/@cook/video/123",
        kind: "video",
        existing: null,
      },
    ])
  })

  test("imports each in the background, tagging the new ones", async () => {
    const res = await t.admin.post("/api/import/batch", {
      urls: [
        "https://food.example/pesto",
        "https://food.example/chili",
        "https://food.example/gone",
        "https://www.tiktok.com/@cook/video/123",
        "https://food.example/pesto#again",
      ],
      tag: "to try",
    })
    expect(res.status).toBe(201)
    // The same link twice is one.
    expect(res.body.batch.items).toHaveLength(4)

    const batch = await finished(res.body.batch.id)
    expect(stateOf(batch)).toEqual({
      "https://food.example/pesto": "added",
      "https://food.example/chili": "duplicate",
      "https://food.example/gone": "failed",
      "https://www.tiktok.com/@cook/video/123": "failed",
    })
    expect(batch.items.map((item) => item.kind)).toEqual([
      "page",
      "page",
      "page",
      "video",
    ])
    expect(batch.items[0]!.recipe?.name).toBe("Pesto Pasta")
    expect(batch.items[1]!.recipe?.slug).toBe("chili")
    expect(batch.items[2]!.error).toBe("Couldn't reach that site")
    // No AI here, which videos need.
    expect(batch.items[3]!.error).toContain("needs AI")

    // Only the new recipe gets the tag.
    const tagged = (await t.admin.get("/api/recipes?tag=to%20try")).body
      .recipes as RecipeSummary[]
    expect(tagged.map((recipe) => recipe.name)).toEqual(["Pesto Pasta"])

    expect((await t.admin.get("/api/import/batch/current")).body.batch).toEqual(
      {
        id: batch.id,
        total: 4,
        done: 4,
        added: 1,
        failed: 2,
        finishedAt: batch.finishedAt,
      }
    )
  })

  test("tries a link again, one or all", async () => {
    const id = (await t.admin.get("/api/import/batch/current")).body.batch.id
    const before = await batchOf(id)
    const gone = before.items.find((item) => item.url.endsWith("/gone"))!
    pages.set("https://food.example/gone", page("Found Again"))

    const res = await t.admin.post(
      `/api/import/batch/${id}/items/${gone.id}/retry`
    )
    expect(res.status).toBe(200)
    const after = await finished(id)
    expect(stateOf(after)["https://food.example/gone"]).toBe("added")
    // The video wasn't retried.
    expect(stateOf(after)["https://www.tiktok.com/@cook/video/123"]).toBe(
      "failed"
    )

    await t.admin.post(`/api/import/batch/${id}/retry`)
    const again = await finished(id)
    expect(stateOf(again)["https://www.tiktok.com/@cook/video/123"]).toBe(
      "failed"
    )
  })

  test("stopping leaves what's waiting, and lets what's going finish", async () => {
    let open = () => {}
    const held = new Promise<void>((resolve) => (open = resolve))
    const urls = [
      "https://food.example/tacos",
      ...[1, 2, 3, 4].map((n) => `https://food.example/more-${n}`),
    ]
    for (const url of urls) gates.set(url, held)
    const started = (await t.admin.post("/api/import/batch", { urls })).body
      .batch as ImportBatch
    // Three pages at a time: wait for them to be under way.
    for (let tries = 0; tries < 100; tries++) {
      const going = (await batchOf(started.id)).items.filter(
        (item) => item.state === "importing"
      )
      if (going.length === 3) break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    const stopped = (await t.admin.post(`/api/import/batch/${started.id}/stop`))
      .body.batch as ImportBatch
    expect(stopped.items.map((item) => item.state)).toEqual([
      "importing",
      "importing",
      "importing",
      "stopped",
      "stopped",
    ])
    open()
    const batch = await finished(started.id)
    expect(batch.items.map((item) => item.state)).toEqual([
      "added",
      "failed",
      "failed",
      "stopped",
      "stopped",
    ])
    gates.clear()
  })

  test("several links shared at once start an import", async () => {
    const res = await t.admin.post("/api/share", {
      text: "https://food.example/soup\nhttps://food.example/pesto",
    })
    expect(res.status).toBe(201)
    const id = (res.body.url as string).match(/\/recipes\/import\/(.+)$/)?.[1]
    expect(id).toBeTruthy()
    const batch = await finished(id!)
    expect(stateOf(batch)).toEqual({
      "https://food.example/soup": "added",
      "https://food.example/pesto": "duplicate",
    })

    // One link still opens the usual import, and a receipt isn't links.
    const one = await t.admin.post("/api/share", {
      text: "Look! https://food.example/soup",
    })
    expect(one.body.url).toContain("/share?link=")
    const receipt = await t.admin.post("/api/share", {
      text: `Your order
${"Great Value Milk 1 gal   $3.48\n".repeat(20)}
Track it: https://shop.example/track/1
Help: https://shop.example/help`,
    })
    expect(receipt.body.url).toContain("/share?inbox=")
  })

  test("a bad link or batch is refused", async () => {
    expect(
      (await t.admin.post("/api/import/batch", { urls: ["not a link"] })).status
    ).toBe(400)
    expect((await t.admin.post("/api/import/batch", { urls: [] })).status).toBe(
      400
    )
    expect((await t.admin.get("/api/import/batch/nope")).status).toBe(404)
  })

  test("after a restart, an unfinished import carries on", async () => {
    const household = (await t.admin.get("/api/household")).body.household
    const [batch] = await t.db
      .insert(importBatches)
      .values({ householdId: household.id, userId: t.adminUser.id })
      .returning()
    await t.db.insert(importBatchItems).values([
      {
        householdId: household.id,
        batchId: batch!.id,
        position: 0,
        url: "https://food.example/tacos",
        kind: "page",
        // Cut off mid-import.
        state: "importing",
      },
    ])
    const events = createEventBus()
    const heard: HouseholdEvent[] = []
    events.subscribe(household.id, {
      userId: t.adminUser.id,
      name: "Admin",
      page: null,
      send: (event) => heard.push(event),
    })
    const service = createImportBatchService(t.db, {
      ai: createAiService(t.db),
      fetcher,
      videoTools,
      afterImport: async () => {},
      events,
    })
    expect(await service.resume()).toBe(1)
    const done = await finished(batch!.id)
    expect(done.items[0]!.state).toBe("duplicate")
    expect(heard).toContainEqual({ type: "imports", batchId: batch!.id })
    const [row] = await t.db
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, batch!.id))
    expect(row!.finishedAt).not.toBeNull()
  })
})
