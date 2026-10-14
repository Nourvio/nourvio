/** 25 → "25 min", 75 → "1 hr 15 min", 120 → "2 hr". */
export function formatMinutes(minutes: number | null | undefined) {
  if (!minutes) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`
}

/** "today", "yesterday", "3 days ago", or a date. */
export function formatRelativeDate(iso: string) {
  const date = new Date(iso)
  const days = Math.floor(
    (startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86_400_000
  )
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 7) return `${days} days ago`
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: days > 300 ? "numeric" : undefined,
  })
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
