import type { ImportResult } from "@mise/shared"
import { inArray } from "drizzle-orm"

import type { Db } from "../db/client.ts"
import { recipes } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { saveImage } from "../services/images.ts"
import { createRecipe, getRecipe } from "../services/recipes.ts"
import { extractRecipeFromHtml } from "./jsonld.ts"
import type { Fetcher } from "./safe-fetch.ts"

const VIDEO_HOSTS =
  /(^|\.)(tiktok\.com|youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch)$/i

const TRACKING_PARAM = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|igshid|si)$/i

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
  url.hash = ""
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key)
  }
  return url.toString()
}

export function isVideoUrl(url: string) {
  return VIDEO_HOSTS.test(new URL(url).hostname)
}

async function findBySourceUrl(db: Db, urls: string[]) {
  const [row] = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(inArray(recipes.sourceUrl, urls))
    .limit(1)
  return row ? getRecipe(db, row.id) : null
}

function decodeHtml(body: Buffer, contentType: string) {
  const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1]
  try {
    return new TextDecoder(charset ?? "utf-8").decode(body)
  } catch {
    return body.toString("utf8")
  }
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

/**
 * Imports a recipe from a web page using the schema.org data most recipe
 * sites embed. If the link was imported before, returns that recipe instead,
 * unless `force` is set.
 */
export async function importFromUrl(
  db: Db,
  rawUrl: string,
  options: { userId: string; fetcher: Fetcher; force?: boolean }
): Promise<ImportResult> {
  const url = normalizeUrl(rawUrl)
  if (isVideoUrl(url)) {
    throw new HttpError(422, "Importing from video links is coming soon")
  }
  if (!options.force) {
    const existing = await findBySourceUrl(db, [url])
    if (existing) return { recipe: existing, duplicate: true }
  }

  const page = await options.fetcher(url)
  if (page.contentType && !/html|xml/i.test(page.contentType)) {
    throw new HttpError(422, "That link isn't a web page")
  }
  const finalUrl = normalizeUrl(page.url)
  if (!options.force && finalUrl !== url) {
    const existing = await findBySourceUrl(db, [finalUrl])
    if (existing) return { recipe: existing, duplicate: true }
  }

  const extracted = extractRecipeFromHtml(
    decodeHtml(page.body, page.contentType),
    finalUrl
  )
  if (!extracted) {
    throw new HttpError(
      422,
      "Couldn't find a recipe on that page. Try pasting the recipe text instead."
    )
  }

  const image = await downloadImage(extracted.imageUrl, options.fetcher)
  const recipe = await createRecipe(db, extracted.input, {
    origin: "url",
    userId: options.userId,
    image,
  })
  return { recipe, duplicate: false }
}
