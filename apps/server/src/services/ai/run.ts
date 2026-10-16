import { PROVIDER_NAMES, type AiTask, type Unavailable } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { LanguageModel, LanguageModelUsage } from "ai"
import type { AppDeps } from "../../core/context.ts"
import { AppError } from "../../core/errors.ts"
import {
  clearOutOfCredit,
  isOutOfCredit,
  markOutOfCredit,
  outOfCreditError,
} from "./credit.ts"
import { targetOf } from "./keys.ts"
import { resolveTask } from "./status.ts"
import { recordUsage } from "./usage.ts"

// The one way a feature calls AI: whose key pays is worked out, the limits
// are checked against a rough estimate first, and what the call took and
// cost is recorded after, against the household, the person, the task and
// the key. A key its provider says is out of credit is noted, and the call
// goes to the next key there is.

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
  // A key that turns out to be out of credit is noted, and the next tried:
  // a few at most.
  const outOfCredit: string[] = []
  for (let tries = 0; tries < 5; tries++) {
    const resolution = await resolveTask(
      deps,
      em,
      options.householdId,
      options.task,
      options.estimate
    )
    if (!resolution.ok) {
      if (outOfCredit.length > 0) throw outOfCreditError(outOfCredit[0]!)
      throw aiUnavailable(resolution.why)
    }
    const { key, model } = resolution
    const target = await targetOf(deps, em, key.id, model)
    let result: T
    try {
      result = await call(deps.ai(target))
    } catch (error) {
      if (!isOutOfCredit(error)) throw error
      await markOutOfCredit(deps, em, key.id)
      outOfCredit.push(PROVIDER_NAMES[key.provider])
      continue
    }
    await clearOutOfCredit(deps, em, key.id)
    await recordUsage(em, {
      householdId: options.householdId,
      userId: options.userId,
      task: options.task,
      provider: key.provider,
      model,
      source: key.source,
      keyId: key.id,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    })
    return result
  }
  throw outOfCreditError(outOfCredit[0] ?? "The provider")
}
