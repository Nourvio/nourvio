import { z } from "zod"

export const AI_PROVIDERS = ["anthropic", "openai"] as const
export type AiProviderId = (typeof AI_PROVIDERS)[number]

export const AI_PROVIDER_NAMES: Record<AiProviderId, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
}

/** Jobs that can each use their own model. */
export const AI_TASKS = ["import", "cleanup", "chat"] as const
export type AiTask = (typeof AI_TASKS)[number]

export const AI_TASK_NAMES: Record<AiTask, string> = {
  import: "Importing recipes",
  cleanup: "Tidying recipes",
  chat: "Assistant",
}

/** Used when nothing else is picked. */
export const DEFAULT_MODELS: Record<AiProviderId, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-6-sol",
}

/**
 * US dollars per million tokens, input and output, for working out roughly
 * what each request cost. Models not listed show no cost. Checked October 2026.
 */
export const MODEL_PRICES: Record<string, [input: number, output: number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "gpt-6-astra": [10, 50],
  "gpt-6-sol": [2, 10],
  "gpt-6.1-sol": [2, 10],
  "gpt-6-luna": [0.1, 0.5],
}

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
) {
  const price = MODEL_PRICES[model]
  if (!price) return null
  return (inputTokens * price[0] + outputTokens * price[1]) / 1_000_000
}

/** "anthropic:claude-opus-5-5". Split on the first colon; OpenAI ids can contain more. */
export const modelRef = z
  .string()
  .regex(/^(anthropic|openai):\S+$/, "Pick a model from the list")
export type ModelRef = z.infer<typeof modelRef>

export function parseModelRef(ref: string) {
  const at = ref.indexOf(":")
  return {
    provider: ref.slice(0, at) as AiProviderId,
    model: ref.slice(at + 1),
  }
}

export type AiKeyStatus = {
  configured: boolean
  /** Set on the server (and so read-only here), saved in Settings, or missing. */
  source: "env" | "settings" | null
  /** The last few characters, so you can tell keys apart. */
  hint: string | null
}

export type AiSettings = {
  keys: Record<AiProviderId, AiKeyStatus>
  defaultModel: ModelRef | null
  taskModels: Partial<Record<AiTask, ModelRef>>
}

const keyInput = z
  .string()
  .trim()
  .min(10, "That key looks too short")
  .max(500)
  .nullable()
  .optional()

/** Leave a field out to keep it; send null to clear it. */
export const updateAiSettingsInput = z.object({
  keys: z
    .object({ anthropic: keyInput, openai: keyInput })
    .partial()
    .optional(),
  defaultModel: modelRef.nullable().optional(),
  taskModels: z
    .object({
      import: modelRef.nullable(),
      cleanup: modelRef.nullable(),
      chat: modelRef.nullable(),
    })
    .partial()
    .optional(),
})
export type UpdateAiSettingsInput = z.input<typeof updateAiSettingsInput>

export const testAiKeyInput = z.object({
  provider: z.enum(AI_PROVIDERS),
  /** Test this key before saving it. Without it, the saved key is tested. */
  key: z.string().trim().max(500).optional(),
})

export type AiModel = { provider: AiProviderId; id: string; name: string }

/** What any signed-in person needs to know: can AI features be used? */
export type AiStatus = {
  available: boolean
  providers: AiProviderId[]
  /** Spoken words in videos can be transcribed (needs an OpenAI key). */
  transcription: boolean
}

export type AiUsageRow = {
  month: string
  /** Whose usage it was, on the server's keys. */
  household: string | null
  provider: AiProviderId
  model: string
  requests: number
  inputTokens: number
  outputTokens: number
  /** Null when the model's price isn't known. */
  costUsd: number | null
}
