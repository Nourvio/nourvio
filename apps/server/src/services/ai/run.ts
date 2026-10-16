import type { AiTask, Unavailable } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { LanguageModel, LanguageModelUsage } from "ai"
import type { AppDeps } from "../../core/context.ts"
import { AppError } from "../../core/errors.ts"
import { targetOf } from "./keys.ts"
import { resolveTask } from "./status.ts"
import { recordUsage } from "./usage.ts"

// The one way a feature calls AI: whose key pays is worked out, the limits
// are checked against a rough estimate first, and what the call took and
// cost is recorded after, against the household, the person and the task.

/** Why a feature can't use AI, said so someone can fix it. */
const UNAVAILABLE: Record<
  Unavailable,
  { kind: "forbidden" | "rate_limited"; message: string }
> = {
  noKey: {
    kind: "forbidden",
    message:
      "There's no AI key for this. A household admin can add one in Settings, Household, AI.",
  },
  notCovered: {
    kind: "forbidden",
    message:
      "The server's AI keys don't cover this. A household admin can add a key of the household's own in Settings, Household, AI.",
  },
  overLimit: {
    kind: "rate_limited",
    message:
      "This month's AI on the server's keys is used up. It's back next month, or a household admin can add a key of the household's own.",
  },
  ownLimit: {
    kind: "rate_limited",
    message:
      "This month's limit on the household's own AI keys is reached. A household admin can raise it in Settings, Household, AI.",
  },
}

export function aiUnavailable(why: Unavailable) {
  const { kind, message } = UNAVAILABLE[why]
  return new AppError(kind, `ai_${why}`, message)
}

/**
 * Runs an AI call for a household's task. `call` gets the model to use and
 * returns what AI SDK did, its usage included.
 */
export async function useAi<T extends { usage: LanguageModelUsage }>(
  deps: Pick<AppDeps, "settings" | "fetcher" | "ai">,
  em: EntityManager,
  options: {
    householdId: string
    /** Who asked; none for background work. */
    userId: string | null
    task: AiTask
    /** A rough cost, in US dollars, checked against the limits first. */
    estimate?: number
  },
  call: (model: LanguageModel) => Promise<T>
): Promise<T> {
  const resolution = await resolveTask(
    deps,
    em,
    options.householdId,
    options.task,
    options.estimate
  )
  if (!resolution.ok) throw aiUnavailable(resolution.why)
  const target = await targetOf(deps, em, resolution.key.id, resolution.model)
  const result = await call(deps.ai(target))
  await recordUsage(em, {
    householdId: options.householdId,
    userId: options.userId,
    task: options.task,
    provider: resolution.key.provider,
    model: resolution.model,
    source: resolution.key.source,
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
  })
  return result
}
