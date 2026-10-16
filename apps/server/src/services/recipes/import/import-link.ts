import type { EntityManager } from "@mikro-orm/sql"
import sharp from "sharp"
import { AppError } from "../../../core/errors.ts"
import type { Fetcher } from "../../fetch/public-fetch.ts"
import type { FileStore } from "../../storage/files.ts"
import { MAX_PHOTO_BYTES, removePhoto, storePhoto } from "../photos.ts"
import { createRecipe, loadRecipe } from "../recipes.ts"
import { tidyAfterImport } from "../review/tidy-run.ts"
import { readPage, type AiDeps } from "./ai-reader.ts"
import { findBySourceUrl, isVideoLink, normalizeLink } from "./links.ts"
import { readRecipeData } from "./recipe-data.ts"
import { importVideo, type VideoDeps } from "./import-video.ts"

/** Photos smaller than this on their short side are icons or thumbnails. */
const MIN_PHOTO_SIDE = 200
/** Good enough to stop looking for a bigger one. */
const GOOD_PHOTO_SIDE = 450

/** A page's text, in the character set it says it uses. */
export function decodeHtml(body: Buffer, contentType: string) {
  const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1]
  try {
    return new TextDecoder(charset ?? "utf-8").decode(body)
  } catch {
    return body.toString("utf8")
  }
}

/**
 * The first of these photos that loads and is big enough to show well, or
 * else the biggest that will do. A missing photo isn't worth failing over.
 */
export async function downloadPhoto(
  fetcher: Fetcher,
  urls: string[],
  referer: string
): Promise<Buffer | null> {
  let fallback: { body: Buffer; side: number } | null = null
  for (const url of urls.slice(0, 5)) {
    try {
      const photo = await fetcher(url, {
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        maxBytes: MAX_PHOTO_BYTES,
        referer,
      })
      const { width = 0, height = 0 } = await sharp(photo.body).metadata()
      const side = Math.min(width, height)
      if (side >= GOOD_PHOTO_SIDE) return photo.body
      if (side >= MIN_PHOTO_SIDE && side > (fallback?.side ?? 0)) {
        fallback = { body: photo.body, side }
      }
    } catch {
      continue
    }
  }
  return fallback?.body ?? null
}

export type ImportResult = {
  recipe: Awaited<ReturnType<typeof loadRecipe>>
  /** It was in the library already, from the same link. */
  duplicate: boolean
}

/**
 * Adds a recipe from a link, using the recipe data most recipe sites put in
 * their pages for search engines, and its photo. A page without it is read
 * by AI, when the household has it. A link imported before gives back that
 * recipe instead, unless `force`.
 */
export async function importLink(
  em: EntityManager,
  deps: AiDeps & VideoDeps & { files: FileStore },
  options: {
    householdId: string
    userId: string | null
    url: string
    force?: boolean
  }
): Promise<ImportResult> {
  const already = async (urls: string[]) => {
    if (options.force) return null
    const existing = await findBySourceUrl(em, urls)
    return existing
      ? { recipe: await loadRecipe(em, existing.id), duplicate: true }
      : null
  }

  const { fetcher, files } = deps
  const url = normalizeLink(options.url)
  const known = await already([url])
  if (known) return known
  if (isVideoLink(url)) {
    return importVideo(em, deps, { ...options, url, already })
  }

  const page = await fetcher(url)
  if (page.contentType && !/html|xml/i.test(page.contentType)) {
    throw new AppError(
      "unprocessable",
      "not_a_page",
      "That link isn't a web page."
    )
  }
  const pageUrl = normalizeLink(page.url)
  const redirected = pageUrl === url ? null : await already([pageUrl])
  if (redirected) return redirected

  const html = decodeHtml(page.body, page.contentType)
  const data =
    readRecipeData(html, pageUrl) ??
    (await readPage(deps, em, {
      householdId: options.householdId,
      userId: options.userId,
      html,
      pageUrl,
    }))

  const photo = await downloadPhoto(fetcher, data.photoUrls, pageUrl)
  const photoId = photo
    ? await storePhoto(files, options.householdId, photo).catch(() => null)
    : null
  try {
    const recipe = await createRecipe(em, {
      householdId: options.householdId,
      userId: options.userId,
      input: data.input,
      origin: "link",
      photoId,
      nutrition: data.nutrition,
    })
    await tidyAfterImport(em, {
      householdId: options.householdId,
      userId: options.userId,
      recipeId: recipe.id,
    })
    return { recipe, duplicate: false }
  } catch (err) {
    await removePhoto(files, options.householdId, photoId)
    throw err
  }
}
