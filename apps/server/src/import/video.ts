import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { ImportResult } from "@mise/shared"

import type { AiService } from "../ai/service.ts"
import type { AiPart } from "../ai/types.ts"
import type { Db } from "../db/client.ts"
import { HttpError } from "../http.ts"
import { createRecipe } from "../services/recipes.ts"
import { extractRecipe } from "./ai-extract.ts"
import type { Fetcher } from "./safe-fetch.ts"
import { downloadImage, findBySourceUrl, normalizeUrl } from "./links.ts"
import { captionsToText, type VideoTools } from "./video-tools.ts"

/** Short-form videos get frames read too; that's where amounts often appear on screen. */
const SHORT_VIDEO_SECONDS = 5 * 60
const FRAME_COUNT = 8
/** Longer than this, transcribing costs more than it's likely worth. */
const MAX_TRANSCRIBE_SECONDS = 30 * 60

async function fetchCaptions(url: string, fetcher: Fetcher) {
  try {
    const { body } = await fetcher(url, { accept: "text/vtt,*/*" })
    return captionsToText(body.toString("utf8")) || null
  } catch {
    return null
  }
}

/**
 * Imports a recipe from a TikTok, YouTube or Instagram link: the caption,
 * what's said (captions, or a transcript when there are none and an OpenAI
 * key is set) and, for short videos, frames from the video, read by AI.
 */
export async function importFromVideo(
  db: Db,
  url: string,
  options: {
    userId: string
    ai: AiService
    tools: VideoTools
    fetcher: Fetcher
    force?: boolean
  }
): Promise<ImportResult> {
  const { ai, tools, fetcher, userId } = options
  const status = await ai.status()
  if (!status.available) {
    throw new HttpError(
      422,
      "Reading recipes from videos needs AI. An admin can add a Claude or OpenAI key in Settings."
    )
  }

  const info = await tools.probe(url)
  const sourceUrl = normalizeUrl(info.url)
  if (!options.force && sourceUrl !== url) {
    const existing = await findBySourceUrl(db, [sourceUrl])
    if (existing) return { recipe: existing, duplicate: true }
  }

  const canTranscribe = status.transcription
  const short =
    info.duration === null ? true : info.duration <= SHORT_VIDEO_SECONDS
  let transcript = info.captions
    ? await fetchCaptions(info.captions.url, fetcher)
    : null
  const wantTranscript =
    !transcript &&
    canTranscribe &&
    (info.duration ?? 0) <= MAX_TRANSCRIBE_SECONDS

  const dir = await mkdtemp(join(tmpdir(), "mise-video-"))
  let frames: Buffer[] = []
  try {
    if (short || wantTranscript) {
      const file = await tools.download(url, dir, { audioOnly: !short })
      if (short) {
        frames = await tools.frames(file, dir, FRAME_COUNT, info.duration)
      }
      if (wantTranscript) {
        transcript = await ai.transcribe(
          userId,
          await tools.extractAudio(file, dir)
        )
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  if (!info.description && !transcript && !frames.length) {
    throw new HttpError(
      422,
      "That video has no caption or captions to read" +
        (canTranscribe ? "." : ". With an OpenAI key, Mise can listen to it.")
    )
  }

  const text = [
    `Video: ${info.title ?? "(untitled)"}`,
    info.uploader && `By: ${info.uploader}`,
    `Link: ${sourceUrl}`,
    info.description && `Caption / description:\n${info.description}`,
    transcript && `What's said in the video:\n${transcript.slice(0, 30_000)}`,
    frames.length > 0 &&
      `The ${frames.length} images are frames from the video, in order.`,
  ]
    .filter(Boolean)
    .join("\n\n")
  const parts: AiPart[] = [
    ...frames.map((frame): AiPart => ({
      type: "image",
      mediaType: "image/jpeg",
      data: frame.toString("base64"),
    })),
    { type: "text", text },
  ]
  const input = await extractRecipe(ai, userId, parts, sourceUrl)

  const image = await downloadImage(info.thumbnail, fetcher)
  const recipe = await createRecipe(db, input, {
    origin: "video",
    userId,
    image,
  })
  return { recipe, duplicate: false }
}
