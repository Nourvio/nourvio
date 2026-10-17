import type { AisleKey } from "../list/aisles.ts"
import { BRANDS_EN } from "./data/brands-en.ts"
import { NAMES_EN } from "./data/en.ts"
import { FOODS } from "./data/foods.ts"

// The foods Merran knows, by any of their names: finding the food in what
// a recipe line says ("King Arthur Unbleached All-Purpose Flour" is
// all-purpose flour), whatever else is around it. See docs/foods.md.

/** What's true of a food in every language. */
export type FoodFacts = {
  /** Where it's shelved. */
  aisle: AisleKey
  /** What it's a kind of: green bell pepper is a bell pepper. */
  parent?: string
  /** A size that makes it a different thing to buy: large eggs. */
  keepSize?: true
}

/** The names a food goes by in a language, besides its key. */
export type FoodNames = Readonly<Record<string, readonly string[]>>

/** A language's brands: words to drop, and brands that name a food. */
export type FoodBrands = {
  drop: readonly string[]
  means: Readonly<Record<string, string>>
}

/** A food found in some words. */
export type FoodFound = {
  /** Its key: "all-purpose flour"; "dried oregano" for a kind of oregano. */
  key: string
  /** What the list shows: the words that named it, as written. */
  name: string
}

/**
 * Words before a food that make it a different thing to buy, kept with
 * it: dried oregano isn't fresh, a red onion isn't a yellow one.
 */
const KINDS = new Set([
  "dried",
  "frozen",
  "smoked",
  "ground",
  "powdered",
  "pickled",
  "roasted",
  "sweet",
  "hot",
  "dark",
  "light",
  "vegan",
])

/** Colors, which make a different fruit or vegetable: a red grape. */
const COLORS = new Set([
  "red",
  "green",
  "yellow",
  "white",
  "black",
  "brown",
  "purple",
  "golden",
])

/**
 * Two words before a food that make it a different thing to buy, which
 * matters for allergies: dairy-free milk isn't milk.
 */
const FREE_OF = new Set(["dairy", "gluten", "sugar", "egg", "nut", "plant"])
const FREE = new Set(["free", "based"])

/** Sizes, kept for a food whose size is what's bought. */
const SIZES = new Set(["large", "medium", "small", "jumbo", "extra"])

/** "Tinned" is "canned", so both find the same food. */
const SAME_WORD: Record<string, string> = { tinned: "canned" }

function singular(word: string) {
  if (word === "leaves") return "leaf"
  if (/(ss|us|is)$/.test(word)) return word
  if (/ies$/.test(word)) return word.replace(/ies$/, "y")
  if (/(oes|ches|shes|xes|sses)$/.test(word)) return word.replace(/es$/, "")
  if (/[^s]s$/.test(word)) return word.slice(0, -1)
  return word
}

/** A word as it's matched: lowercase, no accents, singular. */
function wordForm(word: string) {
  const plain = word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  return singular(SAME_WORD[plain] ?? plain)
}

type Token = { form: string; start: number; end: number }

/** Words and where they are: hyphens and slashes part them, apostrophes don't. */
function tokens(text: string): Token[] {
  const found: Token[] = []
  for (const match of text.matchAll(/[\p{L}\p{N}'’]+/gu)) {
    const form = wordForm(match[0].replace(/['’]/g, ""))
    if (form) {
      found.push({
        form,
        start: match.index,
        end: match.index + match[0].length,
      })
    }
  }
  return found
}

const formOf = (text: string) => tokens(text).map((token) => token.form)

type Vocabulary = {
  /** Every name's words, joined, to its food's key. */
  names: Map<string, string>
  /** Brands that name a food, the same way. */
  means: Map<string, string>
  /** Brands to drop, as their words. */
  drop: string[][]
  /** The most words in a name. */
  longest: number
}

/**
 * A language's lookup: each food's names (in English its key is one too),
 * and its brands.
 */
function build(
  language: string,
  names: FoodNames,
  brands: FoodBrands
): Vocabulary {
  const index = new Map<string, string>()
  let longest = 1
  for (const key of Object.keys(FOODS)) {
    const aliases = names[key] ?? []
    for (const name of language === "en" ? [key, ...aliases] : aliases) {
      const words = formOf(name)
      index.set(words.join(" "), key)
      longest = Math.max(longest, words.length)
    }
  }
  const means = new Map<string, string>()
  for (const [brand, key] of Object.entries(brands.means)) {
    const words = formOf(brand)
    means.set(words.join(" "), key)
    longest = Math.max(longest, words.length)
  }
  return {
    names: index,
    means,
    drop: brands.drop.map((brand) => formOf(brand)),
    longest,
  }
}

/** Each language's names, and its lookup. */
const NAMES: Record<string, FoodNames> = { en: NAMES_EN }
const VOCABULARIES: Record<string, Vocabulary> = {
  en: build("en", NAMES_EN, BRANDS_EN),
}

/** What's true of a food, if Merran knows it. */
export function foodFacts(key: string): FoodFacts | undefined {
  return FOODS[key]
}

/** A food's name in a language: its key in English, else its first name. */
export function foodName(key: string, language = "en") {
  if (language === "en") return key
  return NAMES[language]?.[key]?.[0] ?? key
}

/**
 * The food some words are about, if Merran knows it: the first place in
 * them where a known name starts, the longest name there. Brands are
 * dropped first ("King Arthur"), or name the food themselves ("Diamond
 * Crystal" is kosher salt). A word before it that makes it a kind ("dried
 * oregano") stays with it, as does a size for a food sold by size ("large
 * eggs"). Null when no known food is in them.
 */
export function findFood(text: string, language = "en"): FoodFound | null {
  const vocabulary = VOCABULARIES[language] ?? VOCABULARIES.en!
  const all = tokens(text)
  // Brands' words are skipped, and noted where they name a food.
  const kept: Token[] = []
  for (let at = 0; at < all.length; at++) {
    const brand = vocabulary.drop.find((words) =>
      words.every((word, i) => all[at + i]?.form === word)
    )
    if (brand) {
      at += brand.length - 1
      continue
    }
    kept.push(all[at]!)
  }
  for (let at = 0; at < all.length; at++) {
    for (let size = vocabulary.longest; size >= 1; size--) {
      const words = all.slice(at, at + size)
      if (words.length < size) continue
      const key = vocabulary.means.get(words.map((word) => word.form).join(" "))
      if (key) return { key, name: foodName(key, language) }
    }
  }

  // The longest name, and of those the last: English puts the food last,
  // so "vanilla ice cream" is ice cream and "chicken sausage" sausage.
  let best: { at: number; size: number; key: string } | null = null
  for (let at = 0; at < kept.length; at++) {
    const most = Math.min(vocabulary.longest, kept.length - at)
    for (let size = most; size >= 1; size--) {
      const words = kept.slice(at, at + size)
      const key = vocabulary.names.get(words.map((word) => word.form).join(" "))
      if (!key) continue
      if (!best || size >= best.size) best = { at, size, key }
      break
    }
  }
  if (!best) return null
  const last = kept[best.at + best.size - 1]!
  let first = best.at
  let kind = ""
  const before = kept[best.at - 1]
  const twoBefore = kept[best.at - 2]
  const produce = FOODS[best.key]?.aisle === "produce"
  if (
    before &&
    twoBefore &&
    FREE.has(before.form) &&
    FREE_OF.has(twoBefore.form)
  ) {
    // "Dairy-free milk", "gluten-free flour": kept, hyphenated.
    kind = `${twoBefore.form}-${before.form} `
    first = best.at - 2
  } else if (
    before &&
    (KINDS.has(before.form) || (produce && COLORS.has(before.form)))
  ) {
    kind = `${before.form} `
    first = best.at - 1
  } else if (before && SIZES.has(before.form) && FOODS[best.key]?.keepSize) {
    first = best.at - 1
  }
  return {
    key: `${kind}${best.key}`,
    name: text.slice(kept[first]!.start, last.end),
  }
}
