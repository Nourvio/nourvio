import Anthropic from "@anthropic-ai/sdk"
import { AI_PROVIDER_NAMES, type AiProviderId } from "@mise/shared"
import OpenAI from "openai"

import { HttpError } from "../http.ts"

/** Turns an SDK error (or a bad response) into a message worth showing. */
export function providerError(
  provider: AiProviderId,
  error: unknown
): HttpError {
  const name = AI_PROVIDER_NAMES[provider]
  if (error === "too-long") {
    return new HttpError(502, `${name} ran out of room before finishing`)
  }
  if (error === "no-output") {
    return new HttpError(502, `${name} didn't send back a usable answer`)
  }
  if (error instanceof HttpError) return error

  const status =
    error instanceof Anthropic.APIError || error instanceof OpenAI.APIError
      ? error.status
      : undefined
  if (status === 401 || status === 403) {
    return new HttpError(502, `${name} didn't accept the API key`)
  }
  if (status === 404) {
    return new HttpError(
      502,
      `${name} doesn't have that model. Pick another in Settings → AI.`
    )
  }
  if (status === 429) {
    const code =
      error instanceof OpenAI.APIError || error instanceof Anthropic.APIError
        ? (error as { code?: unknown }).code
        : undefined
    const detail = error instanceof Error ? error.message : ""
    console.warn(`${name} said 429:`, code ?? "", detail)
    if (code === "insufficient_quota" || /credit|quota|billing/i.test(detail)) {
      return new HttpError(
        502,
        `The ${name} account is out of credit. Add some in its billing settings.`
      )
    }
    return new HttpError(
      502,
      `${name} is getting too many requests right now. Try again in a minute.`
    )
  }
  if (status === 400) {
    const detail = error instanceof Error ? error.message : ""
    console.error(`${name} rejected a request:`, detail)
    return new HttpError(502, `${name} rejected the request`)
  }
  if (
    status === 529 ||
    error instanceof Anthropic.APIConnectionError ||
    error instanceof OpenAI.APIConnectionError
  ) {
    return new HttpError(502, `Couldn't reach ${name}. Try again in a minute.`)
  }
  console.error(`${name} request failed:`, error)
  return new HttpError(502, `Something went wrong talking to ${name}`)
}
