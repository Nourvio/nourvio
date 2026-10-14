import {
  AI_PROVIDER_NAMES,
  AI_PROVIDERS,
  DEFAULT_MODELS,
  estimateCost,
  parseModelRef,
  type AiModel,
  type AiProviderId,
  type AiSettings,
  type AiStatus,
  type AiTask,
  type AiUsageRow,
  type ModelRef,
  type updateAiSettingsInput,
} from "@mise/shared"
import { desc, eq, gte, sql } from "drizzle-orm"
import type { z } from "zod"

import type { Db } from "../db/client.ts"
import { aiUsage, settings } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { decryptSecret, encryptSecret } from "../secrets.ts"
import { createAnthropicProvider } from "./anthropic.ts"
import { createOpenAiProvider } from "./openai.ts"
import type { AiProvider, AiProviderFactory, ExtractRequest } from "./types.ts"

const SETTINGS_KEY = "ai"

const ENV_KEYS: Record<AiProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
}

/** What's stored in the settings table. Keys are encrypted. */
type StoredAiSettings = {
  keys?: Partial<Record<AiProviderId, string>>
  defaultModel?: ModelRef | null
  taskModels?: Partial<Record<AiTask, ModelRef>>
}

export const defaultProviderFactory: AiProviderFactory = (id, apiKey) =>
  id === "anthropic"
    ? createAnthropicProvider(apiKey)
    : createOpenAiProvider(apiKey)

function hint(key: string) {
  return `…${key.slice(-4)}`
}

export type AiService = ReturnType<typeof createAiService>

export function createAiService(
  db: Db,
  factory: AiProviderFactory = defaultProviderFactory
) {
  let modelCache: { at: number; signature: string; models: AiModel[] } | null =
    null

  async function load(): Promise<StoredAiSettings> {
    const [row] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, SETTINGS_KEY))
    return (row?.value as StoredAiSettings | undefined) ?? {}
  }

  async function save(value: StoredAiSettings) {
    await db
      .insert(settings)
      .values({ key: SETTINGS_KEY, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
  }

  /** The usable key for each provider. A server environment variable wins. */
  async function keys(stored?: StoredAiSettings) {
    const value = stored ?? (await load())
    const result: Partial<
      Record<AiProviderId, { key: string; source: "env" | "settings" }>
    > = {}
    for (const id of AI_PROVIDERS) {
      const fromEnv = process.env[ENV_KEYS[id]]?.trim()
      const saved = value.keys?.[id]
      const fromSettings = saved ? decryptSecret(saved) : null
      if (fromEnv) result[id] = { key: fromEnv, source: "env" }
      else if (fromSettings)
        result[id] = { key: fromSettings, source: "settings" }
    }
    return result
  }

  async function getSettings(): Promise<AiSettings> {
    const stored = await load()
    const available = await keys(stored)
    const keyStatus = Object.fromEntries(
      AI_PROVIDERS.map((id) => {
        const found = available[id]
        return [
          id,
          {
            configured: Boolean(found),
            source: found?.source ?? null,
            hint: found ? hint(found.key) : null,
          },
        ]
      })
    ) as AiSettings["keys"]
    return {
      keys: keyStatus,
      defaultModel: stored.defaultModel ?? null,
      taskModels: stored.taskModels ?? {},
    }
  }

  async function updateSettings(input: z.output<typeof updateAiSettingsInput>) {
    const stored = await load()
    const next: StoredAiSettings = {
      keys: { ...stored.keys },
      defaultModel: stored.defaultModel ?? null,
      taskModels: { ...stored.taskModels },
    }
    for (const id of AI_PROVIDERS) {
      const key = input.keys?.[id]
      if (key === undefined) continue
      if (key === null) delete next.keys![id]
      else next.keys![id] = encryptSecret(key)
    }
    if (input.defaultModel !== undefined) next.defaultModel = input.defaultModel
    for (const [task, ref] of Object.entries(input.taskModels ?? {})) {
      if (ref === undefined) continue
      if (ref === null) delete next.taskModels![task as AiTask]
      else next.taskModels![task as AiTask] = ref
    }
    await save(next)
    modelCache = null
    return getSettings()
  }

  async function status(): Promise<AiStatus> {
    const available = await keys()
    const providers = AI_PROVIDERS.filter((id) => available[id])
    return {
      available: providers.length > 0,
      providers,
      transcription: Boolean(available.openai),
    }
  }

  /** Tries a key (given, or the saved one) by listing the provider's models. */
  async function testKey(id: AiProviderId, key?: string) {
    const apiKey = key || (await keys())[id]?.key
    if (!apiKey) {
      throw new HttpError(400, `Add a ${AI_PROVIDER_NAMES[id]} key first`)
    }
    const models = await factory(id, apiKey).listModels()
    return { models: models.length }
  }

  /** Every model the configured keys can use, cached for ten minutes. */
  async function listModels() {
    const available = await keys()
    const signature = AI_PROVIDERS.map((id) => available[id]?.key ?? "").join(
      "|"
    )
    if (
      modelCache &&
      modelCache.signature === signature &&
      Date.now() - modelCache.at < 10 * 60_000
    ) {
      return modelCache.models
    }
    const lists = await Promise.all(
      AI_PROVIDERS.filter((id) => available[id]).map((id) =>
        factory(id, available[id]!.key)
          .listModels()
          .catch(() => [] as AiModel[])
      )
    )
    const models = lists.flat()
    modelCache = { at: Date.now(), signature, models }
    return models
  }

  /**
   * The provider and model for a task: the task's own pick, then the default,
   * then whichever provider has a key. A pick whose provider lost its key is
   * skipped.
   */
  async function resolve(
    task: AiTask
  ): Promise<{ provider: AiProvider; model: string }> {
    const stored = await load()
    const available = await keys(stored)
    for (const ref of [stored.taskModels?.[task], stored.defaultModel]) {
      if (!ref) continue
      const { provider, model } = parseModelRef(ref)
      const found = available[provider]
      if (found) return { provider: factory(provider, found.key), model }
    }
    for (const id of AI_PROVIDERS) {
      const found = available[id]
      if (found)
        return { provider: factory(id, found.key), model: DEFAULT_MODELS[id] }
    }
    throw new HttpError(
      400,
      "AI isn't set up yet. An admin can add a Claude or OpenAI key in Settings."
    )
  }

  /** Runs a structured extraction for a task and records what it used. */
  async function extract<T extends z.ZodType>(
    task: AiTask,
    userId: string | null,
    request: Omit<ExtractRequest<T>, "model">
  ): Promise<z.output<T>> {
    const { provider, model } = await resolve(task)
    const { data, usage } = await provider.extract({ ...request, model })
    await db.insert(aiUsage).values({
      userId,
      provider: provider.id,
      model,
      task,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: estimateCost(model, usage.inputTokens, usage.outputTokens),
    })
    return data
  }

  /**
   * Speech to text with whichever configured provider can do it (OpenAI).
   * Returns null when none can.
   */
  async function transcribe(userId: string | null, audio: Buffer) {
    const available = await keys()
    for (const id of AI_PROVIDERS) {
      const found = available[id]
      if (!found) continue
      const provider = factory(id, found.key)
      if (!provider.transcribe) continue
      const { text, model, usage } = await provider.transcribe(
        audio,
        "audio.mp3"
      )
      await db.insert(aiUsage).values({
        userId,
        provider: id,
        model,
        task: "import",
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: estimateCost(model, usage.inputTokens, usage.outputTokens),
      })
      return text
    }
    return null
  }

  /** Requests, tokens and rough cost by month and model, for the last six months. */
  async function usageSummary(): Promise<AiUsageRow[]> {
    const since = new Date()
    since.setMonth(since.getMonth() - 5, 1)
    since.setHours(0, 0, 0, 0)
    const month = sql<string>`to_char(date_trunc('month', ${aiUsage.createdAt}), 'YYYY-MM')`
    const rows = await db
      .select({
        month,
        provider: aiUsage.provider,
        model: aiUsage.model,
        requests: sql<number>`count(*)::int`,
        inputTokens: sql<number>`sum(${aiUsage.inputTokens})::int`,
        outputTokens: sql<number>`sum(${aiUsage.outputTokens})::int`,
        costUsd: sql<number | null>`sum(${aiUsage.costUsd})`,
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, since))
      .groupBy(month, aiUsage.provider, aiUsage.model)
      .orderBy(desc(month), desc(sql`count(*)`))
    return rows.map((row) => ({
      ...row,
      costUsd: row.costUsd === null ? null : Number(row.costUsd),
    }))
  }

  return {
    getSettings,
    updateSettings,
    status,
    testKey,
    listModels,
    resolve,
    extract,
    transcribe,
    usageSummary,
  }
}
