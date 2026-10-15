import { pantryKey } from "./pantry.ts"

/**
 * Things assumed to be at home, left off lists made from the plan. Each
 * covers its kinds: "salt" takes in kosher salt and sea salt too.
 */
export const DEFAULT_ON_HAND = ["salt", "pepper", "water", "ice"]

/** Kinds that are the same thing to keep on hand, as pantry keys. */
const KINDS: [string, RegExp][] = [
  [
    "salt",
    /^(?:(?:kosher|sea|table|fine|coarse|flaky|flake|iodized|plain)\s+)*salt$/,
  ],
  // Not bell, red, white or cayenne pepper: those are their own things.
  ["pepper", /^(?:(?:ground|cracked|fresh|black)\s+)*pepper$/],
  [
    "water",
    /^(?:(?:cold|warm|hot|boiling|lukewarm|ice|tap|filtered|room temperature)\s+)*water$/,
  ],
  ["ice", /^ice(?: cube)?$/],
]

const KIND_NAMES = new Set(KINDS.map(([kind]) => kind))

/** An on-hand thing as matched: "Kosher salt" and "salt" are both "salt". */
export function onHandKey(name: string) {
  const key = pantryKey(name)
  return KINDS.find(([, kinds]) => kinds.test(key))?.[0] ?? key
}

/**
 * What a name stands for on hand: one thing, except that "salt and pepper"
 * is both salt and pepper.
 */
export function onHandKeys(name: string): string[] {
  const parts = name
    .toLowerCase()
    .split(/\s*(?:,|&|\+|\band\b)\s*/)
    .filter(Boolean)
  if (parts.length > 1) {
    const keys = parts.map(onHandKey)
    if (keys.every((key) => KIND_NAMES.has(key))) return [...new Set(keys)]
  }
  return [onHandKey(name)]
}

/** A test for whether something is always on hand: "kosher salt" is, when salt is. */
export function onHandTest(onHand: string[]) {
  const have = new Set(onHand.flatMap(onHandKeys))
  return (name: string) => onHandKeys(name).every((key) => have.has(key))
}

/**
 * The always-on-hand list without repeats, in order and lowercase: "black
 * pepper" and "salt and pepper" fold into "salt" and "pepper". Kinds of salt,
 * pepper, water and ice read as just that; anything else keeps its wording.
 */
export function tidyOnHand(names: string[]) {
  const seen = new Set<string>()
  const tidy: string[] = []
  for (const name of names) {
    const text = name.trim().toLowerCase()
    if (!text) continue
    for (const key of onHandKeys(text)) {
      if (seen.has(key)) continue
      seen.add(key)
      tidy.push(KIND_NAMES.has(key) ? key : text)
    }
  }
  return tidy
}
