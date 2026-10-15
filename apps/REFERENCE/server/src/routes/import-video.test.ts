import { join } from "node:path"

import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import type { AiPart, AiProviderFactory } from "../ai/types.ts"
import { HttpError } from "../http.ts"
import type { ExtractedRecipe } from "../import/ai-extract.ts"
import type { Fetcher } from "../import/safe-fetch.ts"
import type { VideoInfo, VideoTools } from "../import/video-tools.ts"
import { createTestAppWithAdmin } from "../test/helpers.ts"

const RECIPE: ExtractedRecipe = {
  found: true,
  name: "Hot Honey Feta Pasta",
  description: null,
  servings: 2,
  yieldText: null,
  prepMinutes: null,
  cookMinutes: 15,
  totalMinutes: null,
  ingredients: ["8 oz feta", "2 tbsp hot honey", "8 oz pasta"],
  steps: ["Roast the feta with honey.", "Toss with the pasta."],
  tags: ["pasta"],
  notes: null,
}

const TIKTOK: VideoInfo = {
  url: "https://www.tiktok.com/@chef/video/7400000000000000001",
  title: "Hot honey feta pasta",
  description: "Hot honey feta pasta 🍯 8oz feta, 2 tbsp hot honey #pasta",
  uploader: "chef",
  duration: 42,
  thumbnail: "https://cdn.example/thumb.jpg",
  captions: null,
}

const YOUTUBE_CAPTIONED: VideoInfo = {
  url: "https://www.youtube.com/watch?v=captioned",
  title: "Weeknight pasta, explained",
  description: "Full recipe on my site.",
  uploader: "Kitchen",
  duration: 1200,
  thumbnail: null,
  captions: { url: "https://captions.example/en.vtt", lang: "en" },
}

const YOUTUBE_SILENT: VideoInfo = {
  url: "https://www.youtube.com/watch?v=nocaptions",
  title: "Pasta",
  description: null,
  uploader: null,
  duration: 900,
  thumbnail: null,
  captions: null,
}

describe("import from a video link", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const seen = {
    parts: [] as AiPart[][],
    downloads: [] as { url: string; audioOnly: boolean }[],
    transcribed: 0,
  }
  const infos: Record<string, VideoInfo> = {
    "https://vm.tiktok.com/ZM123/": TIKTOK,
    "https://youtu.be/captioned": YOUTUBE_CAPTIONED,
    "https://youtu.be/nocaptions": YOUTUBE_SILENT,
  }

  const tools: VideoTools = {
    async probe(url) {
      const info = infos[url]
      if (!info)
        throw new HttpError(422, "That doesn't look like a link to a video")
      return info
    },
    async download(url, dir, { audioOnly }) {
      seen.downloads.push({ url, audioOnly })
      return join(dir, "video.mp4")
    },
    async extractAudio() {
      return Buffer.from("fake mp3")
    },
    async frames(_file, _dir, count) {
      const frame = await sharp({
        create: { width: 64, height: 64, channels: 3, background: "#fc0" },
      })
        .jpeg()
        .toBuffer()
      return Array.from({ length: Math.min(count, 3) }, () => frame)
    },
  }

  const fetcher: Fetcher = async (url) => {
    if (url === "https://captions.example/en.vtt") {
      return {
        url,
        contentType: "text/vtt",
        body: Buffer.from(
          "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nboil a pound of rigatoni\n"
        ),
      }
    }
    if (url === "https://cdn.example/thumb.jpg") {
      return {
        url,
        contentType: "image/jpeg",
        body: await sharp({
          create: { width: 720, height: 1280, channels: 3, background: "#333" },
        })
          .jpeg()
          .toBuffer(),
      }
    }
    throw new HttpError(502, "Couldn't reach that site")
  }

  const aiFactory: AiProviderFactory = (id) => ({
    id,
    async extract(request) {
      seen.parts.push(request.parts)
      return {
        data: RECIPE as never,
        usage: { inputTokens: 5000, outputTokens: 300 },
      }
    },
    async listModels() {
      return []
    },
    ...(id === "openai"
      ? {
          async transcribe() {
            seen.transcribed++
            return {
              text: "today we're making rigatoni with vodka sauce",
              model: "gpt-4o-mini-transcribe",
              usage: { inputTokens: 900, outputTokens: 40 },
            }
          },
        }
      : {}),
  })

  beforeAll(async () => {
    t = await createTestAppWithAdmin({ aiFactory, fetcher, videoTools: tools })
  })
  afterAll(() => t.close())

  const lastText = () =>
    (seen.parts.at(-1)!.find((p) => p.type === "text") as { text: string }).text

  test("needs AI", async () => {
    const res = await t.admin.post("/api/import/url", {
      url: "https://vm.tiktok.com/ZM123/",
    })
    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/needs AI/)
  })

  test("reads a short video's caption and frames", async () => {
    await t.admin.put("/api/ai/settings", {
      keys: { anthropic: "sk-ant-test-key-1234" },
    })
    const res = await t.admin.post("/api/import/url", {
      url: "https://vm.tiktok.com/ZM123/?_r=1&_t=abc",
    })
    expect(res.status).toBe(201)
    expect(res.body.recipe).toMatchObject({
      name: "Hot Honey Feta Pasta",
      origin: "video",
      sourceUrl: TIKTOK.url,
    })
    expect(res.body.recipe.imageUrl).toBeTruthy()

    expect(seen.downloads.at(-1)).toEqual({
      url: "https://vm.tiktok.com/ZM123/",
      audioOnly: false,
    })
    const parts = seen.parts.at(-1)!
    expect(parts.filter((p) => p.type === "image")).toHaveLength(3)
    expect(lastText()).toContain("8oz feta, 2 tbsp hot honey")
    expect(lastText()).toContain("3 images are frames from the video")
    // No OpenAI key, so no transcript.
    expect(seen.transcribed).toBe(0)
  })

  test("knows a short link it already imported", async () => {
    const res = await t.admin.post("/api/import/url", {
      url: "https://vm.tiktok.com/ZM123/",
    })
    expect(res.status).toBe(200)
    expect(res.body.duplicate).toBe(true)
  })

  test("uses captions on long videos without downloading", async () => {
    const downloads = seen.downloads.length
    const res = await t.admin.post("/api/import/url", {
      url: "https://youtu.be/captioned?si=tracking",
    })
    expect(res.status).toBe(201)
    expect(seen.downloads.length).toBe(downloads)
    expect(lastText()).toContain("boil a pound of rigatoni")
    expect(seen.parts.at(-1)!.some((p) => p.type === "image")).toBe(false)
  })

  test("explains when a video has nothing to read", async () => {
    const res = await t.admin.post("/api/import/url", {
      url: "https://youtu.be/nocaptions",
    })
    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/With an OpenAI key/)
  })

  test("transcribes the audio when there are no captions and OpenAI is set up", async () => {
    await t.admin.put("/api/ai/settings", {
      keys: { openai: "sk-openai-test-key-5678" },
    })
    const res = await t.admin.post("/api/import/url", {
      url: "https://youtu.be/nocaptions",
    })
    expect(res.status).toBe(201)
    expect(seen.downloads.at(-1)).toEqual({
      url: "https://youtu.be/nocaptions",
      audioOnly: true,
    })
    expect(seen.transcribed).toBe(1)
    expect(lastText()).toContain("rigatoni with vodka sauce")

    const usage = await t.admin.get("/api/ai/settings/usage")
    expect(
      usage.body.usage.map((row: { model: string }) => row.model)
    ).toContain("gpt-4o-mini-transcribe")
  })
})
