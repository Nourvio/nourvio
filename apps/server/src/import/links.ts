import { and, eq, inArray } from "drizzle-orm"

import type { Db } from "../db/client.ts"
import { recipes } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import sharp from "sharp"

import { saveImage } from "../services/images.ts"
import { getRecipe } from "../services/recipes.ts"
import type { Fetcher } from "./safe-fetch.ts"

const VIDEO_HOSTS =
  /(^|\.)(tiktok\.com|youtube\.com|youtu\.be|instagram\.com|instagr\.am|facebook\.com|fb\.watch)$/i

const TRACKING_PARAM =
  /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|igshid|igsh|si|feature|_r|_t)$/i

/** Trims the link and drops tracking parameters and the #fragment. */
export function normalizeUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new HttpError(400, "That doesn't look like a link", {
      fields: { url: "Paste a full link, starting with https://" },
    })
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "Only http and https links can be imported", {
      fields: { url: "Paste a full link, starting with https://" },
    })
  }
  url.hash = ""
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key)
  }
  return url.toString()
}

/** TikTok, YouTube, Instagram and Facebook links go to the video importer. */
export function isVideoUrl(url: string) {
  return VIDEO_HOSTS.test(new URL(url).hostname)
}

/** A recipe this household already imported from one of these links, if any. */
export async function findBySourceUrl(
  db: Db,
  householdId: string,
  urls: string[]
) {
  const [row] = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(
      and(
        eq(recipes.householdId, householdId),
        inArray(recipes.sourceUrl, urls)
      )
    )
    .limit(1)
  return row ? getRecipe(db, householdId, row.id) : null
}

/** Photos smaller than this on their short side are icons or thumbnails. */
const MIN_PHOTO_SIDE = 200
/** Good enough to stop looking for a bigger one. */
const GOOD_PHOTO_SIDE = 450

/**
 * Downloads and stores the first of these photos that loads and is big
 * enough to show well, or else the biggest usable one. A missing or broken
 * photo isn't worth failing over.
 */
export async function downloadImage(
  urls: string | null | (string | null)[],
  fetcher: Fetcher,
  { referer }: { referer?: string } = {}
) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter(
    (url): url is string => Boolean(url)
  )
  let fallback: { body: Buffer; side: number } | null = null
  for (const url of list.slice(0, 5)) {
    try {
      const image = await fetcher(url, {
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        maxBytes: 15_000_000,
        referer,
      })
      const { width = 0, height = 0 } = await sharp(image.body).metadata()
      const side = Math.min(width, height)
      if (side >= GOOD_PHOTO_SIDE) return await saveImage(image.body)
      if (side >= MIN_PHOTO_SIDE && side > (fallback?.side ?? 0)) {
        fallback = { body: image.body, side }
      }
    } catch {
      continue
    }
  }
  return fallback ? await saveImage(fallback.body).catch(() => null) : null
}
