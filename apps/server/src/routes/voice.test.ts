import { afterEach, describe, expect, test } from "vitest"

import type { AiProviderFactory } from "../ai/types.ts"
import { aiUsage } from "../db/schema.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

/** A stand-in for Kokoro: lists two voices and "reads" by echoing the text back. */
function fakeKokoro({ down = false } = {}) {
  const spoken: { voice: string; input: string; model: string }[] = []
  const kokoroFetch: typeof fetch = async (input, init) => {
    if (down) throw new TypeError("fetch failed")
    const url = String(input)
    if (url === "http://kokoro:8880/v1/audio/voices") {
      return Response.json({
        voices: [{ id: "bm_george" }, { id: "af_heart" }],
      })
    }
    if (
      url === "http://kokoro:8880/v1/audio/speech" &&
      init?.method === "POST"
    ) {
      const body = JSON.parse(String(init.body))
      spoken.push(body)
      return new Response(new TextEncoder().encode(`MP3:${body.input}`), {
        headers: { "content-type": "audio/mpeg" },
      })
    }
    return new Response("Not found", { status: 404 })
  }
  return { kokoroFetch, spoken }
}

/** OpenAI that can speak, for the paid choice. */
const speakingOpenAi: AiProviderFactory = (id) => ({
  id,
  async listModels() {
    return []
  },
  async extract() {
    throw new Error("Not used here")
  },
  ...(id === "openai"
    ? {
        async speak(text: string, voice: string) {
          return {
            audio: Buffer.from(`OPENAI:${voice}:${text}`),
            model: "gpt-4o-mini-tts",
          }
        },
      }
    : {}),
})

const unique = (text: string) =>
  `${text} (${Math.random().toString(36).slice(2)})`

afterEach(() => {
  delete process.env.KOKORO_URL
})

describe("cook mode's voice", () => {
  test("is the device's own until a server voice is set up", async () => {
    const t = await createTestAppWithAdmin()
    try {
      expect((await t.admin.get("/api/voice")).body.status).toEqual({
        server: false,
      })
      expect(
        (await t.admin.stream("/api/voice/speak", { text: "Hello" })).status
      ).toBe(400)
      expect(
        (await t.admin.get("/api/voice/settings")).body.settings
      ).toMatchObject({
        provider: "device",
        kokoro: { url: null },
        openai: { available: false },
      })
    } finally {
      await t.close()
    }
  })

  test("uses Kokoro when the compose file runs it, making each step once", async () => {
    process.env.KOKORO_URL = "http://kokoro:8880"
    const kokoro = fakeKokoro()
    const t = await createTestAppWithAdmin({ kokoroFetch: kokoro.kokoroFetch })
    try {
      expect((await t.admin.get("/api/voice")).body.status).toEqual({
        server: true,
      })
      expect(
        (await t.admin.get("/api/voice/settings")).body.settings
      ).toMatchObject({
        provider: "kokoro",
        kokoro: {
          url: "http://kokoro:8880",
          fromEnv: true,
          voice: "af_heart",
          voices: ["af_heart", "bm_george"],
          error: null,
        },
      })

      const text = unique("Step 1. Preheat the oven to 425 degrees.")
      const first = await t.admin.stream("/api/voice/speak", { text })
      expect(first.status).toBe(200)
      expect(first.headers.get("content-type")).toBe("audio/mpeg")
      expect(await first.text()).toBe(`MP3:${text}`)
      expect(kokoro.spoken).toEqual([
        expect.objectContaining({
          model: "kokoro",
          voice: "af_heart",
          input: text,
        }),
      ])

      // The same step again comes from what was saved.
      const again = await t.admin.stream("/api/voice/speak", { text })
      expect(await again.text()).toBe(`MP3:${text}`)
      expect(kokoro.spoken).toHaveLength(1)

      // Another voice reads it afresh.
      await t.admin.put("/api/voice/settings", {
        provider: "kokoro",
        kokoroVoice: "bm_george",
      })
      await t.admin.stream("/api/voice/speak", { text })
      expect(kokoro.spoken.at(-1)).toMatchObject({ voice: "bm_george" })
    } finally {
      await t.close()
    }
  })

  test("says when Kokoro can't be reached", async () => {
    process.env.KOKORO_URL = "http://kokoro:8880"
    const t = await createTestAppWithAdmin({
      kokoroFetch: fakeKokoro({ down: true }).kokoroFetch,
    })
    try {
      const { settings } = (await t.admin.get("/api/voice/settings")).body
      expect(settings.kokoro.error).toMatch(/Couldn't reach Kokoro/)
      const res = await t.admin.stream("/api/voice/speak", {
        text: unique("Stir."),
      })
      expect(res.status).toBe(502)
    } finally {
      await t.close()
    }
  })

  test("can use OpenAI's voice, counting what it costs", async () => {
    const t = await createTestAppWithAdmin({ aiFactory: speakingOpenAi })
    try {
      await t.admin.put("/api/ai/settings", {
        keys: { openai: "sk-test-openai-key-1234" },
      })
      const saved = await t.admin.put("/api/voice/settings", {
        provider: "openai",
        openaiVoice: "sage",
      })
      expect(saved.body.settings).toMatchObject({
        provider: "openai",
        openai: { voice: "sage", available: true },
      })
      expect((await t.admin.get("/api/voice")).body.status).toEqual({
        server: true,
      })
      const text = unique("Season the chicken while it heats.")
      const res = await t.admin.stream("/api/voice/speak", { text })
      expect(await res.text()).toBe(`OPENAI:sage:${text}`)

      const usage = await t.db.select().from(aiUsage)
      expect(usage).toEqual([
        expect.objectContaining({ task: "voice", model: "gpt-4o-mini-tts" }),
      ])
      expect(usage[0]!.costUsd).toBeGreaterThan(0)
    } finally {
      await t.close()
    }
  })

  test("only the server admin changes it; anyone can hear it", async () => {
    process.env.KOKORO_URL = "http://kokoro:8880"
    const t = await createTestAppWithAdmin({
      kokoroFetch: fakeKokoro().kokoroFetch,
    })
    try {
      const invite = await t.admin.post("/api/household/invites", {})
      const member = apiClient(t.app)
      await member.post(`/api/join/${invite.body.invite.token}`, {
        username: "sam",
        displayName: "Sam",
        password: "another long password",
      })
      expect((await member.get("/api/voice/settings")).status).toBe(403)
      expect(
        (await member.put("/api/voice/settings", { provider: "device" })).status
      ).toBe(403)
      expect(
        (await member.stream("/api/voice/speak", { text: unique("Serve.") }))
          .status
      ).toBe(200)
      expect(
        (
          await t.admin.put("/api/voice/settings", {
            provider: "kokoro",
            kokoroUrl: "javascript:alert(1)",
          })
        ).status
      ).toBe(400)
    } finally {
      await t.close()
    }
  })
})
