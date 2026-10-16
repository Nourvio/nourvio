import { parseIngredient } from "../ingredients/parse.ts"

// The thing to buy in an ingredient line, named so the same food matches
// across recipes, the list and the pantry: "2 Large Onions" and "1 onion"
// are both "onion".

/** Words that describe a size or freshness, not a different thing to buy. */
const DESCRIPTORS =
  /\b(extra[- ]large|large|medium|small|jumbo|fresh|freshly|ripe|organic)\b/g

function singular(word: string) {
  if (word === "leaves") return "leaf"
  if (/(ss|us|is)$/.test(word)) return word
  if (/ies$/.test(word)) return word.replace(/ies$/, "y")
  if (/(oes|ches|shes|xes|sses)$/.test(word)) return word.replace(/es$/, "")
  if (/[^s]s$/.test(word)) return word.slice(0, -1)
  return word
}

/** A food's key: lowercase, without sizes or freshness, the last word singular. */
export function foodKey(food: string) {
  const words = food
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(DESCRIPTORS, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return food.toLowerCase().trim()
  words[words.length - 1] = singular(words[words.length - 1]!)
  return words.join(" ")
}

/** How-much phrases that aren't part of the thing to buy: "Salt to taste". */
export const HOW_MUCH =
  /\s+(to taste|as needed|if needed|for (serving|garnish|drizzling|frying|dusting|the pan|greasing)|optional)\b.*$/i

/**
 * The thing to buy in an ingredient line, as the list has it: its name
 * ("chicken thighs") and key ("chicken thigh"), or null when there's none.
 */
export function lineFood(line: string) {
  const parsed = parseIngredient(line)
  const name = (parsed.food ?? parsed.text).replace(HOW_MUCH, "").trim()
  return name ? { name, key: foodKey(name) } : null
}
