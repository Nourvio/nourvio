import { foodWords, type RecipeIngredient } from "@mise/shared"

export type StepPart =
  | { type: "text"; text: string }
  | { type: "duration"; text: string; seconds: number; label: string }

const DURATION =
  /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi

const UNIT_SECONDS: Record<string, number> = { h: 3600, m: 60, s: 1 }

/**
 * Splits a step into text and durations ("bake 25 minutes", "simmer 5–7 min"),
 * so durations can become tap-to-start timers. Ranges start at the low end.
 */
export function splitDurations(text: string): StepPart[] {
  const parts: StepPart[] = []
  let last = 0
  for (const match of text.matchAll(DURATION)) {
    const index = match.index ?? 0
    if (index > last)
      parts.push({ type: "text", text: text.slice(last, index) })
    const amount = Number(match[1])
    const unit = UNIT_SECONDS[match[3]!.toLowerCase()[0]!]!
    const short = { h: "hr", m: "min", s: "sec" }[
      match[3]!.toLowerCase()[0] as "h" | "m" | "s"
    ]
    parts.push({
      type: "duration",
      text: match[0],
      seconds: Math.round(amount * unit),
      label: `${match[1]}${match[2] ? `–${match[2]}` : ""} ${short}`,
    })
    last = index + match[0].length
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) })
  return parts
}

/** Ingredients that a step mentions by name, for highlighting while cooking. */
export function ingredientsInStep(
  step: string,
  ingredients: RecipeIngredient[]
) {
  const words = new Set(step.toLowerCase().split(/[^a-z]+/))
  const used = new Set<string>()
  for (const ingredient of ingredients) {
    if (!ingredient.food) continue
    if (foodWords(ingredient.food).some((word) => words.has(word))) {
      used.add(ingredient.id)
    }
  }
  return used
}
