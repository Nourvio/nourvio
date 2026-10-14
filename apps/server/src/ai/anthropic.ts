import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import type { AiModel } from "@mise/shared"

import { providerError } from "./errors.ts"
import type { AiPart, AiProvider } from "./types.ts"

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

export function createAnthropicProvider(apiKey: string): AiProvider {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 180_000 })

  return {
    id: "anthropic",

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
