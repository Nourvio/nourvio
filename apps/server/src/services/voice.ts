import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import {
  DEFAULT_KOKORO_VOICE,
  DEFAULT_OPENAI_VOICE,
  type OpenAiVoice,
  type UpdateVoiceSettingsInput,
  type VoiceProvider,
  type VoiceSettings,
  type VoiceStatus,
} from "@mise/shared"
import { eq } from "drizzle-orm"

import type { AiActor, AiService } from "../ai/service.ts"
import { config } from "../config.ts"
import type { Db } from "../db/client.ts"
import { settings } from "../db/schema.ts"
import { HttpError } from "../http.ts"

const SETTINGS_KEY = "voice"

/** Stored in the settings table. */
type StoredVoiceSettings = {
  provider?: VoiceProvider
  /** Overrides KOKORO_URL; null or missing uses it. */
  kokoroUrl?: string | null
  kokoroVoice?: string
  openaiVoice?: OpenAiVoice
}

/** Where read-aloud audio is kept, one file per provider, voice and text. */
export function voiceDir() {
  return join(config.dataDir, "voice")
}

/**
 * Cook mode's server voice: Kokoro (an open voice model running beside
 * Mise) or OpenAI, with the audio saved so each step is only made once.
 */
export function createVoiceService(
  db: Db,
  ai: AiService,
  { kokoroFetch = fetch }: { kokoroFetch?: typeof fetch } = {}
) {
  async function load(): Promise<StoredVoiceSettings> {
    const [row] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, SETTINGS_KEY))
    return (row?.value as StoredVoiceSettings | undefined) ?? {}
  }

  async function save(value: StoredVoiceSettings) {
    await db
      .insert(settings)
      .values({ key: SETTINGS_KEY, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
  }

  const envUrl = () => process.env.KOKORO_URL?.trim() || null
  const kokoroUrl = (stored: StoredVoiceSettings) =>
    stored.kokoroUrl ?? envUrl()

  /** What's picked, or Kokoro when the compose file runs it, else the device's voices. */
  const providerOf = (stored: StoredVoiceSettings): VoiceProvider =>
    stored.provider ?? (kokoroUrl(stored) ? "kokoro" : "device")

  async function status(): Promise<VoiceStatus> {
    const stored = await load()
    const provider = providerOf(stored)
    return {
      server:
        provider === "kokoro"
          ? Boolean(kokoroUrl(stored))
          : provider === "openai"
            ? await ai.canSpeak()
            : false,
    }
  }

  /** The voices Kokoro offers, or why it couldn't be reached. */
  async function kokoroVoices(url: string) {
    try {
      const res = await kokoroFetch(new URL("/v1/audio/voices", url), {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as { voices?: unknown[] }
      const voices = (body.voices ?? [])
        .map((voice) =>
          typeof voice === "string" ? voice : (voice as { id?: unknown })?.id
        )
        .filter((id): id is string => typeof id === "string")
        .sort()
      return { voices, error: null }
    } catch {
      return {
        voices: [],
        error: `Couldn't reach Kokoro at ${url}. Is its container running?`,
      }
    }
  }

  async function getSettings(): Promise<VoiceSettings> {
    const stored = await load()
    const url = kokoroUrl(stored)
    const found = url ? await kokoroVoices(url) : { voices: [], error: null }
    return {
      provider: providerOf(stored),
      kokoro: {
        url,
        fromEnv: stored.kokoroUrl == null && url !== null,
        voice: stored.kokoroVoice ?? DEFAULT_KOKORO_VOICE,
        ...found,
      },
      openai: {
        voice: stored.openaiVoice ?? DEFAULT_OPENAI_VOICE,
        available: await ai.canSpeak(),
      },
    }
  }

  async function updateSettings(input: UpdateVoiceSettingsInput) {
    const stored = await load()
    await save({
      provider: input.provider,
      kokoroUrl:
        input.kokoroUrl === undefined ? stored.kokoroUrl : input.kokoroUrl,
      kokoroVoice: input.kokoroVoice ?? stored.kokoroVoice,
      openaiVoice: input.openaiVoice ?? stored.openaiVoice,
    })
    return getSettings()
  }

  async function kokoroSpeak(url: string | null, voice: string, text: string) {
    if (!url) {
      throw new HttpError(
        400,
        "Kokoro has no address. The server admin can set it in Settings → This server → Voice."
      )
    }
    let res: Response
    try {
      res = await kokoroFetch(new URL("/v1/audio/speech", url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "kokoro",
          input: text,
          voice,
          response_format: "mp3",
          speed: 1,
        }),
        // An older CPU takes a few seconds to start; a long step, longer.
        signal: AbortSignal.timeout(60_000),
      })
    } catch {
      throw new HttpError(
        502,
        "Couldn't reach Kokoro. Is its container running?"
      )
    }
    if (!res.ok) {
      throw new HttpError(502, `Kokoro couldn't read that (${res.status}).`)
    }
    return Buffer.from(await res.arrayBuffer())
  }

  /** MP3 of the text in the server's voice, made once and kept. */
  async function speak(actor: AiActor, text: string) {
    const stored = await load()
    const provider = providerOf(stored)
    if (provider === "device") {
      throw new HttpError(
        400,
        "This server doesn't read aloud; the device's own voice does."
      )
    }
    const voice =
      provider === "kokoro"
        ? (stored.kokoroVoice ?? DEFAULT_KOKORO_VOICE)
        : (stored.openaiVoice ?? DEFAULT_OPENAI_VOICE)
    const name = createHash("sha256")
      .update(`${provider}|${voice}|${text}`)
      .digest("hex")
      .slice(0, 40)
    const file = join(voiceDir(), `${name}.mp3`)
    try {
      return await readFile(file)
    } catch {
      // Not made yet.
    }
    const audio =
      provider === "kokoro"
        ? await kokoroSpeak(kokoroUrl(stored), voice, text)
        : await ai.speak(actor, text, voice)
    await mkdir(voiceDir(), { recursive: true })
    await writeFile(file, audio)
    return audio
  }

  return { status, getSettings, updateSettings, speak }
}

export type VoiceService = ReturnType<typeof createVoiceService>
