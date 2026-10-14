import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import type { AiModel } from "@mise/shared"

import { providerError } from "./errors.ts"
import type { AiPart, AiProvider, ChatAdapter } from "./types.ts"

function toBlocks(parts: AiPart[]): Anthropic.ContentBlockParam[] {
  return parts.map((part) =>
    part.type === "text"
      ? { type: "text", text: part.text }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: part.mediaType,
            data: part.data,
          },
        }
  )
}

/** Opus and Sonnet 5 and later think adaptively and take an effort level. */
const MODERN = /^claude-(opus|sonnet)-[5-9]/

function chatAdapter(client: Anthropic): ChatAdapter {
  return {
    async turn({ model, system, history, tools, onText, onToolStart, signal }) {
      let message: Anthropic.Message
      try {
        const stream = client.messages.stream(
          {
            model,
            max_tokens: 16_000,
            system,
            messages: history as Anthropic.MessageParam[],
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
            })),
            // Caches everything up to the latest message, so each turn only
            // pays full price for what's new.
            cache_control: { type: "ephemeral" },
            ...(MODERN.test(model)
              ? {
                  // Thinking isn't shown, but has to be passed back between
                  // turns, so keep it compact.
                  thinking: {
                    type: "adaptive" as const,
                    display: "omitted" as const,
                  },
                  output_config: { effort: "medium" as const },
                }
              : {}),
          },
          { signal }
        )
        stream.on("text", (delta) => onText(delta))
        stream.on("streamEvent", (event) => {
          if (
            event.type === "content_block_start" &&
            event.content_block.type === "tool_use"
          ) {
            onToolStart?.(event.content_block.id, event.content_block.name)
          }
        })
        message = await stream.finalMessage()
      } catch (error) {
        if (signal?.aborted) throw error
        throw providerError("anthropic", error)
      }
      const toolCalls = message.content.flatMap((block) =>
        block.type === "tool_use"
          ? [{ id: block.id, name: block.name, input: block.input }]
          : []
      )
      const usage = message.usage
      return {
        native: [{ role: "assistant", content: message.content }],
        toolCalls,
        stop:
          message.stop_reason === "tool_use"
            ? "tool_use"
            : message.stop_reason === "max_tokens"
              ? "max_tokens"
              : message.stop_reason === "refusal"
                ? "refusal"
                : "end",
        usage: {
          inputTokens:
            usage.input_tokens +
            (usage.cache_creation_input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0),
          outputTokens: usage.output_tokens,
        },
      }
    },
    userMessage: (text) => ({
      role: "user",
      content: [{ type: "text", text }],
    }),
    toolResults: (results) => [
      {
        role: "user",
        content: results.map((result) => ({
          type: "tool_result",
          tool_use_id: result.id,
          content: result.output,
          is_error: result.isError,
        })),
      },
    ],
    assistantText: (text) => ({
      role: "assistant",
      content: [{ type: "text", text: text || "(stopped)" }],
    }),
  }
}

export function createAnthropicProvider(apiKey: string): AiProvider {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 180_000 })

  return {
    id: "anthropic",
    chat: chatAdapter(client),

    async extract({ model, system, parts, schema, maxTokens = 8000 }) {
      // Reading a recipe is easy work; low effort keeps it quick and cheap.
      const effort = /^claude-(opus|sonnet)-[5-9]/.test(model)
        ? { effort: "low" as const }
        : {}
      let message
      try {
        message = await client.messages.parse({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: toBlocks(parts) }],
          output_config: { format: zodOutputFormat(schema), ...effort },
        })
      } catch (error) {
        throw providerError("anthropic", error)
      }
      if (message.stop_reason === "max_tokens") {
        throw providerError("anthropic", "too-long")
      }
      if (message.parsed_output == null) {
        throw providerError("anthropic", "no-output")
      }
      const usage = message.usage
      return {
        data: message.parsed_output,
        usage: {
          inputTokens:
            usage.input_tokens +
            (usage.cache_creation_input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0),
          outputTokens: usage.output_tokens,
        },
      }
    },

    async listModels() {
      const models: AiModel[] = []
      try {
        for await (const info of client.models.list({ limit: 100 })) {
          models.push({
            provider: "anthropic",
            id: info.id,
            name: info.display_name,
          })
        }
      } catch (error) {
        throw providerError("anthropic", error)
      }
      return models
    },
  }
}
