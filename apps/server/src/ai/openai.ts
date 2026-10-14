import type { AiModel } from "@mise/shared"
import OpenAI, { toFile } from "openai"
import { zodTextFormat } from "openai/helpers/zod"

import { HttpError } from "../http.ts"
import { providerError } from "./errors.ts"
import type { AiPart, AiProvider, ChatAdapter } from "./types.ts"

const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe"

/** Image models, best first. Older ones stand in when a key can't use the newest. */
const IMAGE_MODELS = [
  "gpt-image-2.5-flare",
  "gpt-image-2",
  "gpt-image-1.5",
  "gpt-image-1-mini",
]
/** The first image model that worked, tried first next time. */
let imageModel: string | null = null

function modelMissing(error: unknown) {
  return (
    error instanceof OpenAI.APIError &&
    (error.status === 404 || error.code === "model_not_found")
  )
}

/** OpenAI's image errors worth explaining: an unverified organization and blocked prompts. */
function imageError(error: unknown) {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 403 && /verif/i.test(error.message)) {
      return new HttpError(
        502,
        "OpenAI wants the organization verified before it makes images. Verify it at platform.openai.com, under Settings → Organization."
      )
    }
    if (
      error.code === "moderation_blocked" ||
      /safety system/i.test(error.message)
    ) {
      return new HttpError(
        502,
        "OpenAI wouldn't make a picture for this one. Try again, or add a photo yourself."
      )
    }
  }
  return providerError("openai", error)
}

/** Models that make sense for chat and extraction, not audio, images or embeddings. */
const CHAT_MODEL = /^(gpt-|o\d|chatgpt-)/
const NOT_CHAT =
  /(audio|realtime|transcribe|tts|image|embedding|search|moderation|instruct|codex|computer)/

function toContent(parts: AiPart[]): OpenAI.Responses.ResponseInputContent[] {
  return parts.map((part) =>
    part.type === "text"
      ? { type: "input_text", text: part.text }
      : {
          type: "input_image",
          image_url: `data:${part.mediaType};base64,${part.data}`,
          detail: "auto",
        }
  )
}

const REASONING = /^(gpt-[5-9]|o\d)/

/** The SDK adds parsed copies to output items; the API won't take them back. */
function asInput(items: unknown[]) {
  return JSON.parse(
    JSON.stringify(items, (key, value) =>
      key === "parsed_arguments" || key === "parsed" ? undefined : value
    )
  ) as unknown[]
}

function parseArguments(raw: string) {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return {}
  }
}

function chatAdapter(client: OpenAI): ChatAdapter {
  return {
    async turn({
      model,
      system,
      history,
      tools,
      webSearch,
      onText,
      onToolStart,
      onSearchStart,
      signal,
    }) {
      let response
      try {
        // Stateless: the history is sent each time, with reasoning passed
        // back encrypted, so nothing is stored at OpenAI.
        const stream = client.responses.stream(
          {
            model,
            instructions: system,
            input: history as OpenAI.Responses.ResponseInput,
            tools: [
              ...tools.map((tool) => ({
                type: "function" as const,
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
                strict: false,
              })),
              // Run by OpenAI; results come back in the reply.
              ...(webSearch ? [{ type: "web_search" as const }] : []),
            ],
            store: false,
            max_output_tokens: 16_000,
            ...(REASONING.test(model)
              ? {
                  reasoning: { effort: "medium" as const },
                  include: ["reasoning.encrypted_content" as const],
                }
              : {}),
          },
          { signal }
        )
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") onText(event.delta)
          if (
            event.type === "response.output_item.added" &&
            event.item.type === "function_call"
          ) {
            onToolStart?.(event.item.call_id, event.item.name)
          }
          if (
            event.type === "response.output_item.added" &&
            event.item.type === "web_search_call"
          ) {
            onSearchStart?.(event.item.id)
          }
        }
        response = await stream.finalResponse()
      } catch (error) {
        if (signal?.aborted) throw error
        throw providerError("openai", error)
      }
      const toolCalls = response.output.flatMap((item) =>
        item.type === "function_call"
          ? [
              {
                id: item.call_id,
                name: item.name,
                input: parseArguments(item.arguments),
              },
            ]
          : []
      )
      const searches = response.output.flatMap((item) =>
        item.type === "web_search_call"
          ? [
              {
                id: item.id,
                query:
                  item.action?.type === "search"
                    ? (item.action.query ?? "")
                    : "",
              },
            ]
          : []
      )
      return {
        // Searches aren't sent back: with nothing stored at OpenAI they
        // can't be looked up again, and the reply already carries what was found.
        native: asInput(
          response.output.filter((item) => item.type !== "web_search_call")
        ),
        toolCalls,
        searches,
        stop: toolCalls.length
          ? "tool_use"
          : response.incomplete_details?.reason === "max_output_tokens"
            ? "max_tokens"
            : "end",
        usage: {
          webSearches: searches.length,
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
      }
    },
    userMessage: (text) => ({
      role: "user",
      content: [{ type: "input_text", text }],
    }),
    toolResults: (results) =>
      results.map((result) => ({
        type: "function_call_output",
        call_id: result.id,
        output: result.output,
      })),
    assistantText: (text) => ({
      role: "assistant",
      content: text || "(stopped)",
    }),
  }
}

export function createOpenAiProvider(apiKey: string): AiProvider {
  const client = new OpenAI({ apiKey, maxRetries: 2, timeout: 180_000 })

  return {
    id: "openai",
    chat: chatAdapter(client),

    async extract({
      model,
      system,
      parts,
      schema,
      schemaName,
      maxTokens = 8000,
    }) {
      // Reasoning models think before answering; reading a recipe needs little.
      const reasoning = /^(gpt-[5-9]|o\d)/.test(model)
        ? { reasoning: { effort: "low" as const } }
        : {}
      let response
      try {
        response = await client.responses.parse({
          model,
          instructions: system,
          input: [{ role: "user", content: toContent(parts) }],
          text: { format: zodTextFormat(schema, schemaName) },
          max_output_tokens: maxTokens,
          ...reasoning,
        })
      } catch (error) {
        throw providerError("openai", error)
      }
      if (response.incomplete_details?.reason === "max_output_tokens") {
        throw providerError("openai", "too-long")
      }
      if (response.output_parsed == null) {
        throw providerError("openai", "no-output")
      }
      return {
        // The SDK infers its own version of the schema type; it's the same data.
        data: response.output_parsed as never,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
      }
    },

    async listModels() {
      const models: AiModel[] = []
      try {
        for await (const info of client.models.list()) {
          if (CHAT_MODEL.test(info.id) && !NOT_CHAT.test(info.id)) {
            models.push({ provider: "openai", id: info.id, name: info.id })
          }
        }
      } catch (error) {
        throw providerError("openai", error)
      }
      return models.sort((a, b) => b.id.localeCompare(a.id))
    },

    async transcribe(audio, filename) {
      try {
        const result = await client.audio.transcriptions.create({
          file: await toFile(audio, filename),
          model: TRANSCRIBE_MODEL,
        })
        const usage =
          result.usage?.type === "tokens"
            ? {
                inputTokens: result.usage.input_tokens,
                outputTokens: result.usage.output_tokens,
              }
            : { inputTokens: 0, outputTokens: 0 }
        return { text: result.text, model: TRANSCRIBE_MODEL, usage }
      } catch (error) {
        throw providerError("openai", error)
      }
    },

    async generateImage(prompt) {
      const models = imageModel
        ? [imageModel, ...IMAGE_MODELS.filter((m) => m !== imageModel)]
        : IMAGE_MODELS
      let lastError: unknown
      for (const model of models) {
        let result
        try {
          // Landscape suits recipe cards and the recipe page; medium quality
          // looks good at that size for a fraction of the cost of high.
          result = await client.images.generate({
            model,
            prompt,
            size: "1536x1024",
            quality: "medium",
            output_format: "jpeg",
            output_compression: 90,
            n: 1,
          })
        } catch (error) {
          lastError = error
          if (modelMissing(error)) continue
          throw imageError(error)
        }
        const data = result.data?.[0]?.b64_json
        if (!data) throw providerError("openai", "no-output")
        imageModel = model
        return {
          image: Buffer.from(data, "base64"),
          model,
          usage: {
            inputTokens: result.usage?.input_tokens ?? 0,
            outputTokens: result.usage?.output_tokens ?? 0,
          },
        }
      }
      throw imageError(lastError)
    },
  }
}
