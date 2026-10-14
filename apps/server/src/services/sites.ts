import { createHash } from "node:crypto"

import {
  SUGGESTED_SITES,
  type FollowedSite,
  type SiteRecipe,
} from "@mise/shared"
import { and, eq, isNull, lt, or } from "drizzle-orm"
import { z } from "zod"

import type { Db } from "../db/client.ts"
import { followedSites, type SiteItem } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { fetchFeed, findFeed, type FeedItem } from "../import/feeds.ts"
import { extractRecipeFromHtml } from "../import/jsonld.ts"
import { inLibrary, normalizeUrl } from "../import/links.ts"
import type { Fetcher } from "../import/safe-fetch.ts"
import { decodeHtml } from "../import/url.ts"

type Row = typeof followedSites.$inferSelect

/** How often a feed is read again. */
const REFRESH_MS = 6 * 60 * 60_000
/** Posts kept per site: the feed's newest, then older recipes. */
const KEEP = 24
/** Posts remembered as not recipes. */
const KEEP_SKIPPED = 100
/** After a site turns Mise away, wait this long before trying again. */
const BLOCKED_MS = 30 * 60_000

/**
 * The pause between opening one site's posts. Many sites turn away quick
 * repeat visits but are fine with a steady few. Tests set it to 0.
 */
export const siteTiming = { pauseMs: 3000 }

/** Sites whose posts are being opened now, and ones to leave for a while. */
const checking = new Set<string>()
const blockedUntil = new Map<string, number>()

/** A short, stable key for a post, for its photo's address. */
export function itemKey(url: string) {
  return createHash("sha1").update(url).digest("hex").slice(0, 16)
}

/** The site's name without the feed's tagline ("Inspired Taste – Easy Recipes…"). */
function siteName(title: string | null, url: string) {
  const name = title?.split(/\s+[–—|:]\s+/)[0]?.trim()
  return (name || new URL(url).hostname.replace(/^www\./, "")).slice(0, 80)
}

/** Adds the feed's newest posts to what's known, keeping recipes it has moved past. */
export function mergeItems(
  known: SiteItem[],
  skipped: string[],
  feed: FeedItem[]
): SiteItem[] {
  const byUrl = new Map(known.map((item) => [item.url, item]))
  const fresh = feed
    .filter((item) => !skipped.includes(item.url))
    .map(
      (item): SiteItem =>
        byUrl.get(item.url) ?? { ...item, minutes: null, recipe: null }
    )
  const urls = new Set(fresh.map((item) => item.url))
  const older = known.filter(
    (item) => item.recipe === true && !urls.has(item.url)
  )
  return [...fresh, ...older]
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, KEEP)
}

async function toSites(
  db: Db,
  householdId: string,
  rows: Row[]
): Promise<FollowedSite[]> {
  const library = await inLibrary(
    db,
    householdId,
    rows.flatMap((row) =>
      row.items.filter((item) => item.recipe).map((item) => item.url)
    )
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    url: row.siteUrl,
    feedUrl: row.feedUrl,
    recipes: row.items
      .filter((item) => item.recipe)
      .map((item): SiteRecipe => ({
        url: item.url,
        title: item.title,
        site: row.name,
        minutes: item.minutes,
        imageUrl: item.image
          ? `/api/sites/${row.id}/image/${itemKey(item.url)}`
          : null,
        inLibrary: library.get(item.url) ?? null,
        publishedAt: item.publishedAt,
      })),
    pending: row.items.filter((item) => item.recipe === null).length,
    checking: checking.has(row.id),
    checkedAt: row.checkedAt?.toISOString() ?? null,
    error: row.error,
  }))
}

/** Opens one post as Mise would to import it. "blocked" when the site turned Mise away. */
async function openPost(fetcher: Fetcher, item: SiteItem) {
  let page
  try {
    page = await fetcher(item.url)
  } catch {
    return "blocked" as const
  }
  if (page.contentType && !/html|xml/i.test(page.contentType)) return null
  const recipe = extractRecipeFromHtml(
    decodeHtml(page.body, page.contentType),
    normalizeUrl(page.url)
  )
  if (!recipe) return null
  return {
    title: recipe.input.name,
    minutes: recipe.input.totalMinutes ?? null,
    image: recipe.imageUrls[0] ?? item.image,
  }
}

/**
 * Opens a site's new posts one at a time, a few seconds apart, keeping
 * the recipes and remembering the rest. Stops when the site turns Mise
 * away, to try again later.
 */
async function checkPosts(db: Db, fetcher: Fetcher, siteId: string) {
  if (checking.has(siteId)) return
  if ((blockedUntil.get(siteId) ?? 0) > Date.now()) return
  checking.add(siteId)
  try {
    for (let first = true; ; first = false) {
      const [row] = await db
        .select()
        .from(followedSites)
        .where(eq(followedSites.id, siteId))
      const item = row?.items.find((post) => post.recipe === null)
      if (!row || !item) return
      if (!first && siteTiming.pauseMs) {
        await new Promise((resolve) => setTimeout(resolve, siteTiming.pauseMs))
      }
      const opened = await openPost(fetcher, item)
      if (opened === "blocked") {
        blockedUntil.set(siteId, Date.now() + BLOCKED_MS)
        return
      }
      // Read again: the feed may have been refreshed meanwhile.
      const [current] = await db
        .select()
        .from(followedSites)
        .where(eq(followedSites.id, siteId))
      if (!current) return
      await db
        .update(followedSites)
        .set(
          opened
            ? {
                items: current.items.map((post) =>
                  post.url === item.url
                    ? { ...post, ...opened, recipe: true }
                    : post
                ),
              }
            : {
                items: current.items.filter((post) => post.url !== item.url),
                skipped: [item.url, ...current.skipped].slice(0, KEEP_SKIPPED),
              }
        )
        .where(eq(followedSites.id, siteId))
    }
  } finally {
    checking.delete(siteId)
  }
}

/** Reads a site's feed again and opens any new posts. */
async function refreshSite(db: Db, fetcher: Fetcher, row: Row) {
  try {
    const feed = await fetchFeed(fetcher, row.feedUrl)
    const [current] = await db
      .select()
      .from(followedSites)
      .where(eq(followedSites.id, row.id))
    if (!current) return
    await db
      .update(followedSites)
      .set({
        items: mergeItems(current.items, current.skipped, feed.items),
        checkedAt: new Date(),
        error: null,
      })
      .where(eq(followedSites.id, row.id))
  } catch {
    await db
      .update(followedSites)
      .set({
        checkedAt: new Date(),
        error: "The site's feed didn't open last time. Mise will try again.",
      })
      .where(eq(followedSites.id, row.id))
    return
  }
  await checkPosts(db, fetcher, row.id)
}

/**
 * The household's sites, newest recipes and all. Sites with posts still
 * to open (after a restart, say) carry on in the background.
 */
export async function listSites(db: Db, fetcher: Fetcher, householdId: string) {
  const rows = await db
    .select()
    .from(followedSites)
    .where(eq(followedSites.householdId, householdId))
    .orderBy(followedSites.name)
  for (const row of rows) {
    if (row.items.some((item) => item.recipe === null)) {
      void checkPosts(db, fetcher, row.id).catch(() => {})
    }
  }
  return toSites(db, householdId, rows)
}

/** Follows a site by any of its pages, its feed, or a suggestion. */
export async function followSite(
  db: Db,
  fetcher: Fetcher,
  householdId: string,
  rawUrl: string
) {
  let normal: string | null = null
  try {
    normal = normalizeUrl(rawUrl)
  } catch {
    // Typed without https://; findFeed adds it.
  }
  const suggested = SUGGESTED_SITES.find(
    (site) => site.feedUrl === normal || site.url === normal
  )
  const { feedUrl, feed } = await findFeed(
    fetcher,
    suggested?.feedUrl ?? rawUrl
  )
  const [existing] = await db
    .select({ id: followedSites.id })
    .from(followedSites)
    .where(
      and(
        eq(followedSites.householdId, householdId),
        eq(followedSites.feedUrl, feedUrl)
      )
    )
  if (existing) throw new HttpError(409, "You follow that site already")
  const siteUrl =
    suggested?.url ?? feed.siteUrl ?? `${new URL(feedUrl).origin}/`
  const [row] = await db
    .insert(followedSites)
    .values({
      householdId,
      name: suggested?.name ?? siteName(feed.title, siteUrl),
      siteUrl,
      feedUrl,
      items: mergeItems([], [], feed.items),
      checkedAt: new Date(),
    })
    .returning()
  void checkPosts(db, fetcher, row!.id).catch(() => {})
  return (await toSites(db, householdId, [row!]))[0]!
}

export async function unfollowSite(db: Db, householdId: string, id: string) {
  const removed = z.uuid().safeParse(id).success
    ? await db
        .delete(followedSites)
        .where(
          and(
            eq(followedSites.id, id),
            eq(followedSites.householdId, householdId)
          )
        )
        .returning({ id: followedSites.id })
    : []
  if (!removed.length) throw new HttpError(404, "You don't follow that site")
}

/** A post's photo link and page, for showing it through Mise. */
export async function sitePhoto(
  db: Db,
  householdId: string,
  id: string,
  key: string
) {
  const [row] = z.uuid().safeParse(id).success
    ? await db
        .select()
        .from(followedSites)
        .where(
          and(
            eq(followedSites.id, id),
            eq(followedSites.householdId, householdId)
          )
        )
    : []
  const item = row?.items.find((post) => itemKey(post.url) === key)
  if (!item?.image) throw new HttpError(404, "No photo")
  return { image: item.image, page: item.url }
}

/** Reads every feed not read for a while, a few sites at a time. */
export async function refreshDueSites(db: Db, fetcher: Fetcher) {
  const due = await db
    .select()
    .from(followedSites)
    .where(
      or(
        isNull(followedSites.checkedAt),
        lt(followedSites.checkedAt, new Date(Date.now() - REFRESH_MS))
      )
    )
  let next = 0
  const worker = async () => {
    while (next < due.length) {
      await refreshSite(db, fetcher, due[next++]!)
    }
  }
  await Promise.all(Array.from({ length: 3 }, worker))
}

/** Checks for feeds due a read every half hour. */
export function startSitesScheduler(
  db: Db,
  fetcher: Fetcher,
  everyMs = 30 * 60_000
) {
  const check = () => {
    void refreshDueSites(db, fetcher).catch((error) =>
      console.error("Reading followed sites failed:", error)
    )
  }
  setTimeout(check, 60_000).unref()
  setInterval(check, everyMs).unref()
}
