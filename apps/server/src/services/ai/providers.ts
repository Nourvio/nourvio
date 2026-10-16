import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { PROVIDER_NAMES, type AiProvider } from "@merran/shared"
import type { LanguageModel } from "ai"
import { AppError } from "../../core/errors.ts"
import { addressFetch, type Fetcher } from "../fetch/public-fetch.ts"

// The AI providers, behind one thin layer over AI SDK: listing what a key
// can use (which is how a key is tested, at no cost), and the model to
// call for a provider, a model and a key.

/** Where an AI call goes: a provider's model, with its key or address. */
export type AiTarget = {
  provider: AiProvider
  model: string
  apiKey: string | null
  /** An OpenAI-compatible address. */
  baseUrl: string | null
  /** An address the server admin gave, which may be on the home network. */
  homeNetwork: boolean
}

/** Makes the model to call for a target. Tests pass mock models. */
export type AiModels = (target: AiTarget) => LanguageModel

export function createAiModels(): AiModels {
  return (target) => {
    const apiKey = target.apiKey ?? undefined
    switch (target.provider) {
      case "anthropic":
        return createAnthropic({ apiKey })(target.model)
      case "openai":
        return createOpenAI({ apiKey })(target.model)
      case "google":
        return createGoogleGenerativeAI({ apiKey })(target.model)
      case "openai-compatible":
        return createOpenAICompatible({
          name: "address",
          baseURL: target.baseUrl!,
          apiKey,
          fetch: addressFetch({ homeNetwork: target.homeNetwork }),
          // Ollama, LM Studio and OpenRouter take a JSON schema to answer
          // in; without this AI SDK leaves it out and asks for any JSON.
          supportsStructuredOutputs: true,
        })(target.model)
    }
  }
}

/** Where each provider lists its models, and how a key is sent. */
function modelsRequest(target: Omit<AiTarget, "model">): {
  url: string
  headers: Record<string, string>
} {
  const key = target.apiKey ?? ""
  switch (target.provider) {
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/models?limit=1000",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      }
    case "openai":
      return {
        url: "https://api.openai.com/v1/models",
        headers: { authorization: `Bearer ${key}` },
      }
    case "google":
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
        headers: { "x-goog-api-key": key },
      }
    case "openai-compatible":
      return {
        url: `${target.baseUrl}/models`,
        headers: key ? { authorization: `Bearer ${key}` } : {},
      }
  }
}

/** The model ids in a provider's list: `data[].id`, or Gemini's `models[].name`. */
function idsIn(body: unknown) {
  const list = body as {
    data?: { id?: unknown }[]
    models?: { name?: unknown }[]
  }
  const ids = [
    ...(list.data ?? []).map((model) => model.id),
    ...(list.models ?? []).map((model) =>
      typeof model.name === "string"
        ? model.name.replace(/^models\//, "")
        : null
    ),
  ]
  return [...new Set(ids.filter((id): id is string => typeof id === "string"))]
}

/**
 * The models a key or an address can use, which tests it: the provider
 * says no to a wrong key. Costs nothing.
 */
export async function listModels(
  fetcher: Fetcher,
  target: Omit<AiTarget, "model">
): Promise<string[]> {
  const name =
    target.provider === "openai-compatible"
      ? "That address"
      : PROVIDER_NAMES[target.provider]
  const { url, headers } = modelsRequest(target)
  const response = await fetcher(url, {
    accept: "application/json",
    headers,
    homeNetwork: target.homeNetwork,
    keepErrors: true,
    maxBytes: 2_000_000,
  })
  if (response.status === 401 || response.status === 403) {
    throw new AppError(
      "invalid",
      "ai_key_refused",
      `${name} didn't accept that key. Check it was copied whole.`,
      { key: "Not accepted." }
    )
  }
  if (response.status >= 400) {
    throw new AppError(
      "upstream",
      "ai_provider_failed",
      `${name} answered with an error (${response.status}). Try again in a moment.`
    )
  }
  let body: unknown
  try {
    body = JSON.parse(response.body.toString("utf8"))
  } catch {
    throw new AppError(
      "upstream",
      "ai_provider_failed",
      `${name} didn't answer like an AI provider. Check the address ends in /v1, or wherever its API starts.`
    )
  }
  const ids = idsIn(body)
  if (target.provider === "openai-compatible" && ids.length === 0) {
    throw new AppError(
      "unprocessable",
      "ai_no_models",
      "That address answered, but has no models. Add a model to it first, like `ollama pull llama3.1`."
    )
  }
  return ids.sort()
}
