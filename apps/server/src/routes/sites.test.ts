import { SUGGESTED_SITES, type FollowedSite } from "@mise/shared"
import { eq } from "drizzle-orm"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { followedSites } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import type { Fetcher } from "../import/safe-fetch.ts"
import { refreshDueSites, siteTiming } from "../services/sites.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

type Post = { slug: string; title: string; date: string }

const rss = (title: string, posts: Post[]) => `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<title>${title}</title><link>https://cook.example/</link>
${posts
  .map(
    (post) => `<item><title>${post.title}</title>
<link>https://cook.example/${post.slug}/</link>
<pubDate>${post.date}</pubDate>
<media:content url="https://cook.example/${post.slug}-feed.jpg" medium="image"/></item>`
  )
  .join("\n")}
</channel></rss>`

const recipePage = (name: string) =>
  `<html><head><script type="application/ld+json">${JSON.stringify({
    "@type": "Recipe",
    name,
    totalTime: "PT1H",
    image: `https://cook.example/${name.toLowerCase().replace(/ /g, "-")}.jpg`,
    recipeIngredient: ["1 onion"],
    recipeInstructions: ["Cook it."],
  })}</script></head></html>`

const SOUP = {
  slug: "soup",
  title: "Soup",
  date: "Mon, 12 Oct 2026 05:00:00 GMT",
}
const ROUNDUP = {
  slug: "roundup",
  title: "25 Fall Dinners",
  date: "Tue, 13 Oct 2026 05:00:00 GMT",
}
const STEW = {
  slug: "stew",
  title: "Stew",
  date: "Sun, 11 Oct 2026 05:00:00 GMT",
}
const PIE = { slug: "pie", title: "Pie", date: "Wed, 14 Oct 2026 05:00:00 GMT" }

describe("following recipe sites", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  let posts: Post[] = [SOUP, ROUNDUP, STEW]
  const fetched: string[] = []
  let photo: Buffer

  const html = (body: string, url: string) => ({
    url,
    contentType: "text/html",
    body: Buffer.from(body),
  })
  const fetcher: Fetcher = async (url, options) => {
    fetched.push(`${url} from ${options?.referer ?? "-"}`)
    if (url.endsWith(".jpg")) {
      return { url, contentType: "image/jpeg", body: photo }
    }
    if (url === "https://cook.example/") {
      return html(
        '<html><head><link rel="alternate" type="application/rss+xml" href="/feed/"></head></html>',
        url
      )
    }
    if (url === "https://cook.example/feed/") {
      return html(rss("Cook Example – Recipes for home cooks", posts), url)
    }
    if (url === SUGGESTED_SITES[0]!.feedUrl) {
      return html(rss("RecipeTin Eats", []), url)
    }
    if (url.startsWith("https://guarded.example/")) {
      if (url.endsWith("/feed/")) {
        return html(
          rss("Guarded", [STEW]).replaceAll("cook.example", "guarded.example"),
          url
        )
      }
      throw new HttpError(502, "That site blocked the request")
    }
    if (url.includes("roundup")) {
      return html("<html><body>25 dinners</body></html>", url)
    }
    const slug = url.split("/").at(-2)!
    const name = slug[0]!.toUpperCase() + slug.slice(1)
    return html(recipePage(`Classic ${name}`), url)
  }

  const sites = async () =>
    (await t.admin.get("/api/sites")).body.sites as FollowedSite[]

  /** Waits for every new post to be opened. */
  const settled = async () => {
    for (let i = 0; i < 100; i++) {
      const list = await sites()
      if (list.every((site) => !site.checking && site.pending === 0)) {
        return list
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error("Still checking")
  }

  beforeAll(async () => {
    siteTiming.pauseMs = 0
    photo = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#7a4" },
    })
      .jpeg()
      .toBuffer()
    t = await createTestAppWithAdmin({ fetcher })
  })
  afterAll(() => t.close())

  test("follows a site by its address, keeping only the posts that are recipes", async () => {
    const res = await t.admin.post("/api/sites", { url: "cook.example" })
    expect(res.status).toBe(201)
    expect(res.body.site).toMatchObject({
      name: "Cook Example",
      url: "https://cook.example/",
      feedUrl: "https://cook.example/feed/",
    })

    const [site] = await settled()
    expect(site!.recipes).toEqual([
      expect.objectContaining({
        url: "https://cook.example/soup/",
        title: "Classic Soup",
        site: "Cook Example",
        minutes: 60,
        publishedAt: "2026-10-12T05:00:00.000Z",
        inLibrary: null,
      }),
      expect.objectContaining({ url: "https://cook.example/stew/" }),
    ])
    expect(site!.recipes[0]!.imageUrl).toMatch(
      new RegExp(`^/api/sites/${site!.id}/image/[0-9a-f]{16}$`)
    )
  })

  test("serves photos through Mise, the recipe's own over the feed's", async () => {
    const [site] = await sites()
    const photo = await t.admin.raw(site!.recipes[0]!.imageUrl!)
    expect(photo.status).toBe(200)
    expect(photo.headers.get("content-type")).toBe("image/webp")
    expect(fetched).toContain(
      "https://cook.example/classic-soup.jpg from https://cook.example/soup/"
    )
    expect(
      (await t.admin.raw(`/api/sites/${site!.id}/image/0000000000000000`))
        .status
    ).toBe(404)
  })

  test("reads the feed again later, opening only new posts and keeping older recipes", async () => {
    posts = [PIE, ROUNDUP, STEW]
    await t.db
      .update(followedSites)
      .set({ checkedAt: new Date(Date.now() - 7 * 60 * 60_000) })
    const before = fetched.length
    await refreshDueSites(t.db, fetcher)
    const opened = fetched.slice(before)
    expect(opened).toEqual([
      "https://cook.example/feed/ from -",
      "https://cook.example/pie/ from -",
    ])
    const [site] = await settled()
    expect(site!.recipes.map((r) => r.url)).toEqual([
      "https://cook.example/pie/",
      "https://cook.example/soup/",
      "https://cook.example/stew/",
    ])
  })

  test("says which are in the library", async () => {
    await t.admin.post("/api/import/url", { url: "https://cook.example/stew/" })
    const [site] = await sites()
    expect(site!.recipes[2]!.inLibrary).toMatchObject({ name: "Classic Stew" })
  })

  test("once per site; a suggestion keeps its own name", async () => {
    expect(
      (await t.admin.post("/api/sites", { url: "https://cook.example/feed/" }))
        .status
    ).toBe(409)
    const suggestion = SUGGESTED_SITES[0]!
    const res = await t.admin.post("/api/sites", { url: suggestion.url })
    expect(res.status).toBe(201)
    expect(res.body.site).toMatchObject({
      name: suggestion.name,
      url: suggestion.url,
      feedUrl: suggestion.feedUrl,
    })
  })

  test("waits when a site turns Mise away, keeping the posts to open later", async () => {
    const res = await t.admin.post("/api/sites", {
      url: "https://guarded.example/",
    })
    expect(res.status).toBe(201)
    const tried = () =>
      fetched.filter((line) => line.startsWith("https://guarded.example/stew/"))
        .length
    let guarded: FollowedSite | undefined
    for (let i = 0; i < 100; i++) {
      guarded = (await sites()).find((site) => site.name === "Guarded")
      if (tried() && !guarded?.checking) break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    expect(guarded).toMatchObject({ recipes: [], pending: 1, checking: false })
    // Not tried again straight away.
    await sites()
    expect(tried()).toBe(1)
  })

  test("says when a site has no feed", async () => {
    const res = await t.admin.post("/api/sites", {
      url: "https://none.example",
    })
    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/couldn't find a feed/)
  })

  test("unfollows", async () => {
    const [first] = await sites()
    expect((await t.admin.delete(`/api/sites/${first!.id}`)).status).toBe(204)
    expect((await t.admin.delete(`/api/sites/${first!.id}`)).status).toBe(404)
    const rows = await t.db
      .select()
      .from(followedSites)
      .where(eq(followedSites.id, first!.id))
    expect(rows).toHaveLength(0)
  })

  test("needs signing in", async () => {
    expect((await apiClient(t.app).get("/api/sites")).status).toBe(401)
  })
})
