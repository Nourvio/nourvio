/** What a share into Mise turned out to be, and where to go next. */
export type ShareResult =
  /** A link (a recipe page or a video): import it as a recipe. */
  | { kind: "link"; link: string }
  /** A receipt, read and waiting for its look. */
  | { kind: "receipt"; id: string }
  /** A recipe from photos or text, already in the library. */
  | { kind: "recipe"; slug: string; name: string }
  /** Mise couldn't tell what it was; `got` says what came through ("an image"). */
  | { kind: "unknown"; got: string }

/**
 * The link in what was shared, when sharing it is the point: a link on its
 * own, or with a line of text ("Check out this video! https://..."). A long
 * emailed receipt that happens to mention a website isn't a link.
 */
export function sharedLink(text: string | null | undefined) {
  if (!text) return null
  const match = text.match(/https?:\/\/[^\s<>"']+/)
  if (!match) return null
  const rest = text.replace(match[0], "").trim()
  return rest.length <= 300 ? match[0].replace(/[).,;]+$/, "") : null
}
