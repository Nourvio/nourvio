import { randomBytes } from "node:crypto"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"

import sharp from "sharp"

import { config } from "../config.ts"
import { HttpError } from "../http.ts"

export const IMAGE_NAME = /^[a-z0-9]{24}(-thumb)?\.webp$/

export function imagesDir() {
  return join(config.dataDir, "images")
}

export function imageUrls(name: string | null) {
  return {
    imageUrl: name ? `/api/images/${name}.webp` : null,
    thumbnailUrl: name ? `/api/images/${name}-thumb.webp` : null,
  }
}

/**
 * Stores a photo as a 1600px WebP plus a 640×480 thumbnail for recipe cards,
 * and returns its base name. Phone photos are often 5–10 MB; these are ~200 KB.
 */
export async function saveImage(input: Buffer) {
  let image: ReturnType<typeof sharp>
  try {
    image = sharp(input, { failOn: "error" }).rotate()
    await image.metadata()
  } catch {
    throw new HttpError(400, "That file isn't an image we can read")
  }

  const name = randomBytes(12).toString("hex")
  const dir = imagesDir()
  await mkdir(dir, { recursive: true })
  await image
    .clone()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toFile(join(dir, `${name}.webp`))
  await image
    .clone()
    .resize({ width: 640, height: 480, fit: "cover" })
    .webp({ quality: 75 })
    .toFile(join(dir, `${name}-thumb.webp`))
  return name
}

export async function deleteImage(name: string | null) {
  if (!name) return
  const dir = imagesDir()
  await rm(join(dir, `${name}.webp`), { force: true })
  await rm(join(dir, `${name}-thumb.webp`), { force: true })
}
