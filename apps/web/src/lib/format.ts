/** A date, like "Oct 15, 2026", in the reader's language. */
export function formatDate(iso: string, language: string) {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(
    new Date(iso)
  )
}

/** The days of the week from Sunday (0) to Saturday (6), in the reader's language. */
export function weekdayNames(language: string) {
  const format = new Intl.DateTimeFormat(language, {
    weekday: "long",
    timeZone: "UTC",
  })
  // 4 January 2026 was a Sunday.
  return Array.from({ length: 7 }, (_, day) =>
    format.format(new Date(Date.UTC(2026, 0, 4 + day)))
  )
}
