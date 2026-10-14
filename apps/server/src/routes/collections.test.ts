import type { BrowseCollection } from "@mise/shared"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { STARTER_COLLECTIONS } from "../collections/starter.ts"
import type { Fetcher } from "../import/safe-fetch.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

describe("starter collections", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const fetched: string[] = []

  beforeAll(async () => {
    const photo = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: "#c63" },
    })
      .jpeg()
      .toBuffer()
    const fetcher: Fetcher = async (url, options) => {
      fetched.push(`${url} from ${options?.referer}`)
      return { url, contentType: "image/jpeg", body: photo }
    }
    t = await createTestAppWithAdmin({ fetcher })
  })
  afterAll(() => t.close())

  test("every recipe has a link, a title, a site and a photo", () => {
    for (const collection of STARTER_COLLECTIONS) {
      expect(collection.recipes.length).toBeGreaterThanOrEqual(4)
      for (const recipe of collection.recipes) {
        expect(recipe.url).toMatch(/^https:\/\//)
        expect(recipe.title).toBeTruthy()
        expect(recipe.site).toBeTruthy()
        expect(recipe.image).toMatch(/^https:\/\//)
      }
    }
  })

  test("lists them, saying which are in the library already", async () => {
    const first = STARTER_COLLECTIONS[0]!.recipes[0]!
    await t.admin.post("/api/recipes", {
      name: "My honey chicken",
      sourceUrl: first.url,
      ingredients: ["1 lb chicken"],
    })
    const res = await t.admin.get("/api/collections")
    expect(res.status).toBe(200)
    const collections = res.body.collections as BrowseCollection[]
    expect(collections.map((c) => c.id)).toEqual(
      STARTER_COLLECTIONS.map((c) => c.id)
    )
    const [mine, other] = collections[0]!.recipes
    expect(mine).toMatchObject({
      url: first.url,
      imageUrl: `/api/collections/${collections[0]!.id}/0/image`,
      inLibrary: { name: "My honey chicken" },
    })
    expect(other!.inLibrary).toBeNull()
  })

  test("serves photos through Mise, fetched once", async () => {
    const id = STARTER_COLLECTIONS[1]!.id
    const recipe = STARTER_COLLECTIONS[1]!.recipes[2]!
    const res = await t.admin.raw(`/api/collections/${id}/2/image`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/webp")
    const { width, height } = await sharp(
      Buffer.from(await res.arrayBuffer())
    ).metadata()
    expect([width, height]).toEqual([640, 480])
    expect(fetched).toContain(`${recipe.image} from ${recipe.url}`)

    const before = fetched.length
    await t.admin.raw(`/api/collections/${id}/2/image`)
    expect(fetched.length).toBe(before)

    expect((await t.admin.raw(`/api/collections/${id}/999/image`)).status).toBe(
      404
    )
  })

  test("needs signing in", async () => {
    expect((await apiClient(t.app).get("/api/collections")).status).toBe(401)
  })
})
