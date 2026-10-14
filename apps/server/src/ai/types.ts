import type { AiModel, AiProviderId } from "@mise/shared"
import type { z } from "zod"

export type AiImageType =
  "image/jpeg" | "image/png" | "image/webp" | "image/gif"

/** A piece of what's sent to the model: some text or a base64 image. */
export type AiPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: AiImageType; data: string }

export type ExtractRequest<T extends z.ZodType> = {
  model: string
  system: string
  parts: AiPart[]
  /** Must suit structured outputs: every field required, nulls for "missing". */
  schema: T
  schemaName: string
  maxTokens?: number
}

export type AiUsage = { inputTokens: number; outputTokens: number }

export type ExtractResult<T> = { data: T; usage: AiUsage }

/** One AI service (Claude or OpenAI), with a key. */
export interface AiProvider {
  id: AiProviderId
  /** Asks for JSON matching the schema and returns it parsed. */
  extract<T extends z.ZodType>(
    request: ExtractRequest<T>
  ): Promise<ExtractResult<z.output<T>>>
  listModels(): Promise<AiModel[]>
}

/** Builds a provider for a key. Tests pass a fake one in AppContext. */
export type AiProviderFactory = (id: AiProviderId, apiKey: string) => AiProvider
