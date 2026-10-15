import { addDays, toIsoDate } from "@mise/shared"

const DAY = new Intl.DateTimeFormat(undefined, { weekday: "long" })
const SHORT_DAY = new Intl.DateTimeFormat(undefined, { weekday: "short" })
const MONTH_DAY = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
})

/** "2026-10-14" as a local Date at noon (safe from time zone edges). */
export function fromIsoDate(date: string) {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(y!, m! - 1, d!, 12)
}

export const today = () => toIsoDate(new Date())

export function dayName(date: string) {
  return DAY.format(fromIsoDate(date))
}

export function shortDayName(date: string) {
  return SHORT_DAY.format(fromIsoDate(date))
}

export function monthDay(date: string) {
  return MONTH_DAY.format(fromIsoDate(date))
}

/** "Today", "Tomorrow", or "Wednesday". */
export function friendlyDay(date: string) {
  const now = today()
  if (date === now) return "Today"
  if (date === addDays(now, 1)) return "Tomorrow"
  if (date === addDays(now, -1)) return "Yesterday"
  return dayName(date)
}

/** For the middle of a sentence: "today", "tomorrow", or "Thursday". */
export function dayInSentence(date: string) {
  const day = friendlyDay(date)
  return day === "Today" || day === "Tomorrow" || day === "Yesterday"
    ? day.toLowerCase()
    : day
}

/** "Oct 11 – 17", or "Oct 28 – Nov 3". */
export function weekLabel(start: string) {
  const end = addDays(start, 6)
  const first = fromIsoDate(start)
  const last = fromIsoDate(end)
  return first.getMonth() === last.getMonth()
    ? `${MONTH_DAY.format(first)} – ${last.getDate()}`
    : `${MONTH_DAY.format(first)} – ${MONTH_DAY.format(last)}`
}
