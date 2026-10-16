// Saying why: one reason builder for every suggestion, from Fill the week
// now, and later the autoplan, Today and the assistant. Each reason is data,
// so the app says it in the reader's language; later slices add usual buys
// and sales.

export type Reason =
  /** The night's theme, which it fits: "Taco night". */
  | { kind: "theme"; label: string }
  /** Nothing fitted the night's theme, so it's something else. */
  | { kind: "themeMissed"; label: string }
  /** It uses up food at home that needs using soon: "spinach". */
  | { kind: "usesUp"; foods: string[] }
  /** Never made yet. */
  | { kind: "new" }
  /** Not had in a while. */
  | { kind: "notLately"; weeks: number }
  /** Rated well: 4 or 5 stars. */
  | { kind: "rated"; stars: number }
  /** Quick enough for a weeknight dinner. */
  | { kind: "quick"; minutes: number }

/** What the reason builder looks at. */
export type ReasonRecipe = {
  rating: number | null
  totalMinutes: number | null
  /** When it was last made, or null for never. */
  lastMadeAt: string | Date | null
}

/** Two at most: enough to say why, not so many it's noise. */
const MOST = 2

/**
 * Why a recipe was picked for a meal, strongest first: the night's theme,
 * then food at home it uses up, then something new or not had lately, then
 * a good rating, then quick on a weeknight.
 */
export function reasonsFor(
  recipe: ReasonRecipe,
  {
    today,
    theme,
    weeknightDinner,
    usesUp = [],
  }: {
    /** The household's today, "2026-10-15". */
    today: string
    theme: { label: string; fits: boolean } | null
    weeknightDinner: boolean
    /** Food at home to use soon that it uses. */
    usesUp?: readonly string[]
  }
): Reason[] {
  const reasons: Reason[] = []
  if (theme) {
    reasons.push(
      theme.fits
        ? { kind: "theme", label: theme.label }
        : { kind: "themeMissed", label: theme.label }
    )
  }
  if (usesUp.length > 0) reasons.push({ kind: "usesUp", foods: [...usesUp] })
  if (recipe.lastMadeAt === null) reasons.push({ kind: "new" })
  else {
    const made = new Date(recipe.lastMadeAt).getTime()
    const weeks = Math.floor(
      (new Date(`${today}T00:00:00Z`).getTime() - made) / (7 * 86_400_000)
    )
    if (weeks >= 3) reasons.push({ kind: "notLately", weeks })
  }
  if (recipe.rating !== null && recipe.rating >= 4) {
    reasons.push({ kind: "rated", stars: recipe.rating })
  }
  if (
    weeknightDinner &&
    recipe.totalMinutes !== null &&
    recipe.totalMinutes <= 45
  ) {
    reasons.push({ kind: "quick", minutes: recipe.totalMinutes })
  }
  return reasons.slice(0, MOST)
}
