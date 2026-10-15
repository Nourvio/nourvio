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

/** Kokoro's voice ids start with a language and a voice: "af" is American English, female. */
const KOKORO_LANGUAGES: Record<string, string> = {
  a: "American",
  b: "British",
  e: "Spanish",
  f: "French",
  h: "Hindi",
  i: "Italian",
  j: "Japanese",
  p: "Portuguese",
  z: "Mandarin",
}

/** A Kokoro voice id: "af_heart", "af_v0bella", "af_amelia_inno". */
const KOKORO_VOICE_ID = /^[a-z]{2}_[a-z0-9]+(?:_[a-z0-9]+)*$/

/** Kokoro's English voices, the ones that read English recipes well. */
export function isEnglishKokoroVoice(id: string) {
  return /^[ab][fm]_/.test(id)
}

/** Kokoro keeps its first model's voices ("af_v0bella"), older takes on ones it still has. */
export function isOldKokoroVoice(id: string) {
  return /^[a-z]{2}_v0/.test(id)
}

/** "af_heart" → "Heart, American", "bm_george" → "George, British". */
export function kokoroVoiceName(id: string) {
  const known = KOKORO_VOICES.find((voice) => voice.id === id)
  if (known) return known.name
  const [prefix, name] = id.split("_")
  if (!name) return id
  const language = KOKORO_LANGUAGES[prefix?.[0] ?? ""] ?? prefix!.toUpperCase()
  return `${name[0]!.toUpperCase()}${name.slice(1)}, ${language}`
}

/** "Woman" or "man", from Kokoro's id ("af_…", "am_…"). */
export function kokoroVoiceKind(id: string) {
  return id[1] === "f" ? "Woman" : id[1] === "m" ? "Man" : null
}

/** What a voice preview reads. */
export const VOICE_SAMPLE =
  "Step 2. Pat the chicken dry, then season both sides with salt and pepper. Roast for 25 minutes, until golden."

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
    .regex(KOKORO_VOICE_ID, "A Kokoro voice, like af_heart")
    .optional(),
  openaiVoice: z.enum(OPENAI_VOICES).optional(),
})
export type UpdateVoiceSettingsInput = z.infer<typeof updateVoiceSettingsInput>

/** A voice to hear before picking it (server admin). */
export const previewVoiceInput = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("kokoro"),
    voice: z.string().regex(KOKORO_VOICE_ID),
    /** A Kokoro address not saved yet; else the saved one. */
    kokoroUrl: z
      .url({ protocol: /^https?$/ })
      .max(300)
      .optional(),
  }),
  z.object({
    provider: z.literal("openai"),
    voice: z.enum(OPENAI_VOICES),
  }),
])
export type PreviewVoiceInput = z.infer<typeof previewVoiceInput>

export const speakInput = z.object({
  text: z.string().trim().min(1).max(1500),
})
