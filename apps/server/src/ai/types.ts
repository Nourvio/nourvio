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
  /** Conversations with tools. */
  chat?: ChatAdapter
  /** Speech to text. Only OpenAI has this; Claude doesn't take audio. */
  transcribe?(
    audio: Buffer,
    filename: string
  ): Promise<{ text: string; model: string; usage: AiUsage }>
}

/** A tool the assistant can call, with a JSON schema for its input. */
export type ChatToolSpec = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export type ChatToolCall = { id: string; name: string; input: unknown }

export type ChatTurnResult = {
  /** The assistant's output, in the provider's format, to append to the history. */
  native: unknown[]
  toolCalls: ChatToolCall[]
  stop: "end" | "tool_use" | "max_tokens" | "refusal"
  usage: AiUsage
}

/**
 * One provider's side of a conversation. Histories are kept in each
 * provider's own message format, so a conversation can always continue
 * exactly; a conversation never switches provider.
 */
export interface ChatAdapter {
  /** One model call: streams text through `onText` and returns any tool calls. */
  turn(request: {
    model: string
    system: string
    history: unknown[]
    tools: ChatToolSpec[]
    onText: (delta: string) => void
    /** A tool call has started (its input is still being written). */
    onToolStart?: (id: string, name: string) => void
    signal?: AbortSignal
  }): Promise<ChatTurnResult>
  userMessage(text: string): unknown
  toolResults(
    results: { id: string; output: string; isError: boolean }[]
  ): unknown[]
  /** A plain assistant reply, to close a turn that was stopped part way. */
  assistantText(text: string): unknown
}

/** Builds a provider for a key. Tests pass a fake one in AppContext. */
export type AiProviderFactory = (id: AiProviderId, apiKey: string) => AiProvider
