import type { ImportPageInput, ImportResult } from "@mise/shared"

import type { AiService } from "../ai/service.ts"
import type { Db } from "../db/client.ts"
import { HttpError } from "../http.ts"
import { createRecipe } from "../services/recipes.ts"
import { extractRecipe, pageText } from "./ai-extract.ts"
import { extractRecipeFromHtml, shareImages } from "./jsonld.ts"
import {
  downloadImage,
  findBySourceUrl,
  isVideoUrl,
  normalizeUrl,
} from "./links.ts"
import type { Fetcher } from "./safe-fetch.ts"
import { importFromVideo } from "./video.ts"
import type { VideoTools } from "./video-tools.ts"

export function decodeHtml(body: Buffer, contentType: string) {
  const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1]
  try {
    return new TextDecoder(charset ?? "utf-8").decode(body)
  } catch {
    return body.toString("utf8")
  }
}

/**
 * Imports a recipe from a link. Video links (TikTok, YouTube, Instagram) go
 * to the video importer. Web pages use the schema.org data most recipe sites
 * embed, or AI reading the page when it has none. If the link was imported
 * before, returns that recipe instead, unless `force` is set.
 */
export async function importFromUrl(
  db: Db,
  rawUrl: string,
  options: {
    userId: string
    householdId: string
    fetcher: Fetcher
    ai: AiService
    videoTools: VideoTools
    force?: boolean
  }
): Promise<ImportResult> {
  const url = normalizeUrl(rawUrl)
  if (!options.force) {
    const existing = await findBySourceUrl(db, options.householdId, [url])
    if (existing) return { recipe: existing, duplicate: true }
  }
  if (isVideoUrl(url)) {
    return importFromVideo(db, url, { ...options, tools: options.videoTools })
  }

  const page = await options.fetcher(url)
  if (page.contentType && !/html|xml/i.test(page.contentType)) {
    throw new HttpError(422, "That link isn't a web page")
  }
  const finalUrl = normalizeUrl(page.url)
  if (!options.force && finalUrl !== url) {
    const existing = await findBySourceUrl(db, options.householdId, [finalUrl])
    if (existing) return { recipe: existing, duplicate: true }
  }

  return saveFromHtml(
    db,
    decodeHtml(page.body, page.contentType),
    finalUrl,
    options
  )
}

/** Reads a page's recipe (its recipe data, else AI reading it) and saves it, with its photo. */
async function saveFromHtml(
  db: Db,
  html: string,
  pageUrl: string,
  options: {
    userId: string
    householdId: string
    fetcher: Fetcher
    ai: AiService
  }
): Promise<ImportResult> {
  const extracted =
    extractRecipeFromHtml(html, pageUrl) ??
    (await readWithAi(html, pageUrl, options))
  const image = await downloadImage(extracted.imageUrls, options.fetcher, {
    referer: pageUrl,
  })
  const recipe = await createRecipe(db, options.householdId, extracted.input, {
    origin: "url",
    userId: options.userId,
    image,
  })
  return { recipe, duplicate: false }
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (char) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[char]};`
  )

/**
 * Imports a page the browser extension read in the person's own browser:
 * its recipe data, photos and text, put back together as a small page and
 * read like any link. Gets past sites that turn Mise's server away.
 */
export async function importFromPage(
  db: Db,
  page: ImportPageInput,
  options: {
    userId: string
    householdId: string
    fetcher: Fetcher
    ai: AiService
  }
): Promise<ImportResult> {
  const url = normalizeUrl(page.url)
  if (!page.force) {
    const existing = await findBySourceUrl(db, options.householdId, [url])
    if (existing) return { recipe: existing, duplicate: true }
  }
  const html = [
    "<!doctype html><html><head>",
    page.title ? `<title>${escapeHtml(page.title)}</title>` : "",
    ...(page.images ?? []).map(
      (image) => `<meta property="og:image" content="${escapeHtml(image)}">`
    ),
    ...(page.jsonld ?? []).map(
      (block) =>
        // A "</script" inside the data would end the tag early; "<\/" means the same in JSON.
        `<script type="application/ld+json">${block.replace(/<\/script/gi, "<\\/script")}</script>`
    ),
    "</head><body><main>",
    ...(page.text ?? "")
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    "</main></body></html>",
  ].join("")
  return saveFromHtml(db, html, url, options)
}

/** For pages without recipe data: AI reads the page's text. */
async function readWithAi(
  html: string,
  pageUrl: string,
  options: { userId: string; householdId: string; ai: AiService }
) {
  if (!(await options.ai.status()).available) {
    throw new HttpError(
      422,
      "That page doesn't include recipe data Mise can read. With an AI key set up in Settings, Mise can read pages like this; for now, try pasting the recipe text."
    )
  }
  const { text } = pageText(html)
  const input = await extractRecipe(
    options.ai,
    { userId: options.userId, householdId: options.householdId },
    [{ type: "text", text: `Web page: ${pageUrl}\n\n${text}` }],
    pageUrl
  )
  return { input, imageUrls: shareImages(html, pageUrl) }
}
