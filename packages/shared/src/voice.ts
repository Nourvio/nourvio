import { z } from "zod"

/**
 * Where cook mode's voice comes from: the device's own voices, Kokoro (an
 * open voice model running beside Mise), or OpenAI.
 */
export const VOICE_PROVIDERS = ["device", "kokoro", "openai"] as const
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number]

/** OpenAI's voices for its speech model. */
export const OPENAI_VOICES = [
  "coral",
  "sage",
  "nova",
  "shimmer",
  "alloy",
  "ash",
  "ballad",
  "echo",
  "fable",
  "onyx",
  "verse",
] as const
export type OpenAiVoice = (typeof OPENAI_VOICES)[number]

/** Kokoro voices worth starting with; Kokoro itself lists the rest. */
export const KOKORO_VOICES: { id: string; name: string }[] = [
  { id: "af_heart", name: "Heart, American" },
  { id: "af_bella", name: "Bella, American" },
  { id: "af_nicole", name: "Nicole, American" },
  { id: "am_michael", name: "Michael, American" },
  { id: "am_fenrir", name: "Fenrir, American" },
  { id: "bf_emma", name: "Emma, British" },
  { id: "bm_george", name: "George, British" },
]

export const DEFAULT_KOKORO_VOICE = "af_heart"
export const DEFAULT_OPENAI_VOICE: OpenAiVoice = "coral"

/** "af_heart" → "Heart, American", for voices without a friendlier name. */
export function kokoroVoiceName(id: string) {
  const known = KOKORO_VOICES.find((voice) => voice.id === id)
  if (known) return known.name
  const [prefix, name] = id.split("_")
  if (!name) return id
  const accent =
    { a: "American", b: "British" }[prefix?.[0] ?? ""] ?? prefix!.toUpperCase()
  return `${name[0]!.toUpperCase()}${name.slice(1)}, ${accent}`
}

/** What cook mode needs to know: whether the server reads aloud. */
export type VoiceStatus = { server: boolean }

/** The server admin's view of the voice settings. */
export type VoiceSettings = {
  provider: VoiceProvider
  kokoro: {
    /** Where Kokoro answers, or null when it isn't set up. */
    url: string | null
    /** The address comes from KOKORO_URL (the compose file sets it). */
    fromEnv: boolean
    voice: string
    /** What Kokoro offers, when it could be reached. */
    voices: string[]
    error: string | null
  }
  openai: {
    voice: OpenAiVoice
    /** An OpenAI key is set up. */
    available: boolean
  }
}

export const updateVoiceSettingsInput = z.object({
  provider: z.enum(VOICE_PROVIDERS),
  /** Null goes back to KOKORO_URL. */
  kokoroUrl: z
    .url({ protocol: /^https?$/, error: "An http:// or https:// address" })
    .max(300)
    .nullable()
    .optional(),
  kokoroVoice: z
    .string()
    .regex(/^[a-z]{2}_[a-z0-9]+$/, "A Kokoro voice, like af_heart")
    .optional(),
  openaiVoice: z.enum(OPENAI_VOICES).optional(),
})
export type UpdateVoiceSettingsInput = z.infer<typeof updateVoiceSettingsInput>

export const speakInput = z.object({
  text: z.string().trim().min(1).max(1500),
})
