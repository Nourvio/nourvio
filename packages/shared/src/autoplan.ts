import { z } from "zod"

import { addDays, weekdayOf } from "./plan.ts"

/** What Nourvio did on an autoplan run. */
export type AutoPlanRun = {
  /** The first day of the week it planned. */
  week: string
  at: string
  /** Meals it filled, and how many were empty. */
  planned: number
  empty: number
  /** Lines it added to the shopping list (new or topped up). */
  listed: number
}

/**
 * Plans the week ahead by itself: on `day` at `hour` (the household's own
 * time), it fills the week's empty meals and adds them to the list.
 */
export type AutoPlan = {
  enabled: boolean
  /** 0 for Sunday, 6 for Saturday. */
  day: number
  /** 0–23. */
  hour: number
  addToList: boolean
  /** The household's time zone, from the browser that set it up. */
  timeZone: string
  /** The week already handled: planned, or current when autoplan was turned on. */
  handledWeek: string | null
  last: AutoPlanRun | null
}

export const DEFAULT_AUTO_PLAN: AutoPlan = {
  enabled: false,
  day: 6,
  hour: 9,
  addToList: true,
  timeZone: "UTC",
  handledWeek: null,
  last: null,
}

export const updateAutoPlanInput = z.object({
  enabled: z.boolean(),
  day: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  addToList: z.boolean(),
  timeZone: z.string().trim().min(1).max(64),
})
export type UpdateAutoPlanInput = z.infer<typeof updateAutoPlanInput>

/** The household's clock: today's date, weekday and hour in its time zone. */
export function localClock(now: Date, timeZone: string) {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now)
  } catch {
    // An unknown time zone: use UTC rather than nothing.
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now)
  }
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  const date = `${part("year")}-${part("month")}-${part("day")}`
  return { date, weekday: weekdayOf(date), hour: Number(part("hour")) % 24 }
}

/**
 * The week the most recent scheduled run is for: the week starting on or
 * after that run's day. (Saturday for weeks starting Sunday plans the next
 * day's week; Sunday for weeks starting Sunday plans that same week.)
 */
export function autoPlanTarget(
  plan: Pick<AutoPlan, "day" | "hour" | "timeZone">,
  weekStart: 0 | 1,
  now: Date
) {
  const clock = localClock(now, plan.timeZone)
  let back = (clock.weekday - plan.day + 7) % 7
  if (back === 0 && clock.hour < plan.hour) back = 7
  const due = addDays(clock.date, -back)
  const start = addDays(due, (weekStart - weekdayOf(due) + 7) % 7)
  return { today: clock.date, start, end: addDays(start, 6) }
}

/**
 * What a scheduled run should plan right now, or null when nothing's due:
 * the target week if it hasn't been handled and hasn't ended, from today on.
 * A run missed while the server was off happens as soon as it's back.
 */
export function autoPlanDue(plan: AutoPlan, weekStart: 0 | 1, now: Date) {
  if (!plan.enabled) return null
  const { today, start, end } = autoPlanTarget(plan, weekStart, now)
  if (plan.handledWeek === start || today > end) return null
  return { week: start, from: today > start ? today : start, to: end }
}

/** The week ahead, for planning it now: the next week starting today or later. */
export function weekAhead(weekStart: 0 | 1, timeZone: string, now: Date) {
  const clock = localClock(now, timeZone)
  const start = addDays(clock.date, (weekStart - clock.weekday + 7) % 7)
  return { week: start, from: start, to: addDays(start, 6) }
}
