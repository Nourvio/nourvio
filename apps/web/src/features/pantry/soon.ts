import { addDays, type UseSoonReason } from "@mise/shared"

import {
  dayInSentence,
  monthDay,
  shortDayName,
  today,
} from "@/features/plan/dates"

/** Past dates first, then by date, then leftovers. */
export function urgency(soon: UseSoonReason) {
  if (soon.kind === "leftover") return Number.MAX_SAFE_INTEGER
  return Date.parse(soon.date)
}

/** "Use by tomorrow", "Use by Oct 20". */
export function labelForUseBy(date: string) {
  const now = today()
  return date <= addDays(now, 6)
    ? `Use by ${dayInSentence(date)}`
    : `Use by ${monthDay(date)}`
}

export function soonLabel(soon: UseSoonReason) {
  if (soon.kind !== "leftover") {
    return soon.kind === "past"
      ? `Past its use-by date (${monthDay(soon.date)})`
      : labelForUseBy(soon.date)
  }
  const meal = soon.meals[0]!
  return meal.status === "skipped"
    ? `Bought for ${meal.name}, which was skipped`
    : `Bought for ${meal.name} on ${shortDayName(meal.date)}, not cooked yet`
}
