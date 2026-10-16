/** "Sam Carter" → "SC", "kyle" → "K". */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters =
    parts.length > 1
      ? parts[0]![0]! + parts.at(-1)![0]!
      : (parts[0]?.[0] ?? "?")
  return letters.toUpperCase()
}
