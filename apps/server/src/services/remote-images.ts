import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import sharp from "sharp"

import type { Fetcher } from "../import/safe-fetch.ts"
import { imagesDir } from "./images.ts"

/** Small photos of recipes on other sites, kept so they're fetched once. */
const cacheDir = () => join(imagesDir(), "remote")

/**
 * A recipe card's photo from another site, as a 640×480 WebP, fetched
 * through the server (so browsing doesn't load other sites' images) and
 * cached on disk.
 */
export async function remoteThumbnail(
  fetcher: Fetcher,
  url: string,
  referer?: string
) {
  const name = `${createHash("sha1").update(url).digest("hex")}.webp`
  const path = join(cacheDir(), name)
  try {
    return await readFile(path)
  } catch {
    // Not fetched yet.
  }
  const image = await fetcher(url, {
    accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    maxBytes: 15_000_000,
    referer,
  })
  const thumbnail = await sharp(image.body, { failOn: "error" })
    .rotate()
    .resize({ width: 640, height: 480, fit: "cover" })
    .webp({ quality: 75 })
    .toBuffer()
  await mkdir(cacheDir(), { recursive: true })
  await writeFile(path, thumbnail)
  return thumbnail
}
