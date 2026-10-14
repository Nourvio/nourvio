import { inArray } from "drizzle-orm"

import type { Db } from "../db/client.ts"
import { recipes } from "../db/schema.ts"
import { HttpError } from "../http.ts"
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

/** A recipe already imported from one of these links, if any. */
export async function findBySourceUrl(db: Db, urls: string[]) {
  const [row] = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(inArray(recipes.sourceUrl, urls))
    .limit(1)
  return row ? getRecipe(db, row.id) : null
}

/** Downloads and stores a recipe photo. A missing or broken photo isn't worth failing over. */
export async function downloadImage(url: string | null, fetcher: Fetcher) {
  if (!url) return null
  try {
    const image = await fetcher(url, {
      accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      maxBytes: 15_000_000,
    })
    return await saveImage(image.body)
  } catch {
    return null
  }
}
