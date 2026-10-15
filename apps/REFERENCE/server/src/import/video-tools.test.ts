import { describe, expect, test } from "vitest"

import { captionsToText, pickCaptions, ytDlpError } from "./video-tools.ts"

describe("pickCaptions", () => {
  const vtt = (url: string) => [
    { ext: "json3", url: `${url}.json` },
    { ext: "vtt", url },
  ]

  test("prefers written English captions", () => {
    expect(
      pickCaptions({
        subtitles: { de: vtt("de"), "en-US": vtt("written") },
        automatic_captions: { "en-orig": vtt("auto") },
      })
    ).toEqual({ url: "written", lang: "en-US" })
  })

  test("then what was actually said, over machine translations", () => {
    expect(
      pickCaptions({
        language: "es",
        automatic_captions: {
          en: vtt("translated"),
          "es-orig": vtt("spoken"),
        },
      })
    ).toEqual({ url: "spoken", lang: "es-orig" })
  })

  test("returns null without usable captions", () => {
    expect(pickCaptions({})).toBeNull()
    expect(
      pickCaptions({ subtitles: { live_chat: vtt("chat"), fr: vtt("fr") } })
    ).toBeNull()
  })
})

describe("captionsToText", () => {
  test("keeps the words and drops timings, tags and rolling repeats", () => {
    const vtt = [
      "WEBVTT",
      "Kind: captions",
      "Language: en",
      "",
      "00:00:00.000 --> 00:00:02.000 align:start position:0%",
      "first you<00:00:01.000><c> melt</c><c> the butter</c>",
      "",
      "00:00:02.000 --> 00:00:04.000",
      "first you melt the butter",
      "add two cloves of garlic",
      "",
      "3",
      "00:00:04.000 --> 00:00:06.000",
      "add two cloves of garlic",
      "salt &amp; pepper",
    ].join("\n")
    expect(captionsToText(vtt)).toBe(
      "first you melt the butter\nadd two cloves of garlic\nsalt & pepper"
    )
  })
})

describe("ytDlpError", () => {
  test.each([
    [{ code: "ENOENT" }, 501, /needs yt-dlp/],
    [{ killed: true }, 504, /too long/],
    [
      {
        stderr:
          "ERROR: [Instagram] abc: Requested content is not available, rate-limit reached or login required",
      },
      422,
      /signed-in session/,
    ],
    [
      {
        stderr:
          "ERROR: [youtube] abc: Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies",
      },
      422,
      /signed-in session/,
    ],
    [
      {
        stderr:
          "ERROR: [youtube] abc: Private video. Sign in if you've been granted access to this video",
      },
      422,
      /isn't available/,
    ],
    [
      { stderr: "ERROR: [TikTok] 123: Video not available, status code 10204" },
      422,
      /isn't available/,
    ],
    [{ stderr: "ERROR: something odd" }, 502, /Couldn't read/],
  ])("%o", (error, status, message) => {
    const result = ytDlpError(error)
    expect(result.status).toBe(status)
    expect(result.message).toMatch(message)
  })
})
