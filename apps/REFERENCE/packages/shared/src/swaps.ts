// Words that describe an ingredient rather than name it.
const DESCRIPTIVE = new Set(
  "all purpose fresh large small medium extra virgin chopped minced diced sliced ground whole dried finely roughly thinly freshly packed softened melted cold warm room temperature boneless skinless optional divided plus more for serving taste and the into pieces about natural".split(
    " "
  )
)

/** The words a step might use for a food: "garlic cloves" → garlic, clove, cloves… */
export function foodWords(food: string) {
  const words = food
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 3 && !DESCRIPTIVE.has(word))
  return words.flatMap((word) =>
    word.endsWith("es") && word.length > 4
      ? [word, word.slice(0, -2), word.slice(0, -1)]
      : word.endsWith("s") && word.length > 3
        ? [word, word.slice(0, -1)]
        : [word, `${word}s`]
  )
}

/** "tahini", "milk and lemon juice", "oil, garlic and salt". */
export function listFoods(foods: string[]) {
  const clean = foods.map((food) => food.trim()).filter(Boolean)
  return clean.length > 1
    ? `${clean.slice(0, -1).join(", ")} and ${clean.at(-1)}`
    : (clean[0] ?? "")
}

/** One ingredient swapped this time: the food it was, and the foods used instead. */
export type StepSwap = { from: string; to: string[] }

/** A piece of a step: as written, or a swapped-in name and what it replaced. */
export type StepPiece = { text: string; insteadOf?: string }

type Word = { word: string; start: number; end: number }

/**
 * A step with this time's swaps written in: "whisk together the peanut
 * butter" becomes "whisk together the tahini" when tahini is used instead.
 * `others` are the recipe's other foods, so "butter" isn't swapped inside
 * "peanut butter".
 */
export function swapIntoStep(
  step: string,
  swaps: StepSwap[],
  others: string[] = []
): StepPiece[] {
  if (!swaps.length) return [{ text: step }]
  const words: Word[] = [...step.matchAll(/[A-Za-z]+/g)].map((match) => ({
    word: match[0].toLowerCase(),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }))
  // Next to each other: only spaces or a hyphen between.
  const touching = (a: Word, b: Word) =>
    /^[\s-]*$/.test(step.slice(a.end, b.start))
  const otherWords = others.map((food) => new Set(foodWords(food)))

  const found: { start: number; end: number; text: string }[] = []
  for (const swap of swaps) {
    const own = new Set(foodWords(swap.from))
    const replacement = listFoods(swap.to)
    if (!own.size || !replacement) continue
    for (let i = 0; i < words.length; i++) {
      if (!own.has(words[i]!.word)) continue
      let j = i
      while (
        j + 1 < words.length &&
        own.has(words[j + 1]!.word) &&
        touching(words[j]!, words[j + 1]!)
      ) {
        j++
      }
      const run = words.slice(i, j + 1)
      const before =
        i > 0 && touching(words[i - 1]!, words[i]!) ? words[i - 1] : undefined
      const after =
        j + 1 < words.length && touching(words[j]!, words[j + 1]!)
          ? words[j + 1]
          : undefined
      // Part of another ingredient's name ("peanut butter" when swapping butter).
      const partOfAnother = otherWords.some(
        (other) =>
          run.every((w) => other.has(w.word)) &&
          ((before && other.has(before.word)) ||
            (after && other.has(after.word)))
      )
      if (!partOfAnother) {
        const start = run[0]!.start
        const end = run.at(-1)!.end
        // A sentence's first word keeps its capital.
        const capital = /[A-Z]/.test(step[start]!)
        found.push({
          start,
          end,
          text: capital
            ? replacement[0]!.toUpperCase() + replacement.slice(1)
            : replacement,
        })
      }
      i = j
    }
  }

  found.sort((a, b) => a.start - b.start)
  const pieces: StepPiece[] = []
  let last = 0
  for (const match of found) {
    if (match.start < last) continue
    if (match.start > last) pieces.push({ text: step.slice(last, match.start) })
    pieces.push({
      text: match.text,
      insteadOf: step.slice(match.start, match.end),
    })
    last = match.end
  }
  if (last < step.length) pieces.push({ text: step.slice(last) })
  return pieces
}
