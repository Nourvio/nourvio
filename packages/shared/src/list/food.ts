import { bareFood, parseIngredient } from "../ingredients/parse.ts"
import { guessAisle } from "./aisles.ts"
import { FOOD_SYNONYMS } from "./synonyms.ts"

// The thing to buy in an ingredient line, named so the same food matches
// across recipes, the list and the pantry: "2 Large Onions" and "1 onion"
// are both "onion", "chopped parsley" is parsley, plain flour is
// all-purpose flour.

/**
 * Bumped whenever keys are made differently, so the ones the server keeps
 * (on lists, in the pantry, for aisles and store products) are made again.
 */
export const FOOD_KEYS_VERSION = 3

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

/**
 * A name's plain form: lowercase, without brackets, sizes or freshness,
 * the last word singular. "2 Large Onions" without its number is "onion".
 */
export function plainKey(food: string) {
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

/**
 * A food's key, the same for every way of saying it: its shopping name's
 * plain form, as the synonyms have it. "Chopped fresh flat-leaf parsley"
 * and "parsley" are "parsley"; "plain flour" is "all-purpose flour".
 */
export function foodKey(food: string) {
  const key = plainKey(shoppingName(food))
  return FOOD_SYNONYMS[key] ?? key
}

/**
 * How-much phrases that aren't part of the thing to buy: "Salt to taste",
 * "lemon wedges to serve", "oil, plus a little extra".
 */
export const HOW_MUCH =
  /\s+(to taste|as needed|if needed|as required|to serve|to garnish|to finish|for (serving|garnish|garnishing|decoration|decorating|drizzling|frying|dusting|brushing|greasing|the pan|the tin|the top|topping)|optional|plus (a little |a bit |some )?(extra|more)|or more|or to taste|if (you )?like|if desired|if using)\b.*$/i

/** Ways of preparing it, which don't change what's bought: "chopped". */
const PREP =
  /^(?:(?:finely|roughly|coarsely|thinly|freshly|lightly|very)\s+)?(?:chopped|minced|diced|sliced|peeled|cubed|halved|quartered|softened|melted|beaten|sifted|packed|squeezed|zested|juiced|trimmed|rinsed|drained|torn|crumbled|grated|shredded|crushed|deseeded|seeded|cored)\s+/i

/** A size, which for fruit and vegetables doesn't change what's bought. */
const SIZE = /^(?:extra[- ]large|large|medium|small|jumbo|big)\s+/i

/** Prepared foods that are a product of their own. */
const PRODUCT = /^crushed red pepper/i

/**
 * Prep and size words come off fruit, vegetables, herbs and meat (chopped
 * parsley is parsley, large onions are onions, diced chicken is chicken),
 * not off what's sold that way: diced tomatoes come in cans, grated
 * parmesan in a tub, and large eggs are a size of egg.
 */
function withoutPrep(name: string) {
  let rest = name
  for (;;) {
    if (PRODUCT.test(rest)) return rest
    const aisle = guessAisle(rest)
    if (aisle !== "produce" && aisle !== "meat-seafood") return rest
    const prep = rest.match(PREP)
    // Minced meat is a cut of its own: minced beef is ground beef.
    if (prep && aisle === "meat-seafood" && /minced/i.test(prep[0])) return rest
    const size = aisle === "produce" ? rest.match(SIZE) : null
    const off = prep ?? size
    if (!off || rest.length <= off[0].length) return rest
    rest = rest.slice(off[0].length)
  }
}

/**
 * The first of two choices: "butter or margarine" is butter, "sunflower or
 * vegetable oil" sunflower oil, "chicken or vegetable stock" chicken stock.
 */
function firstChoice(name: string) {
  const choices = name
    .replace(/\s+and\/or\s+/gi, " or ")
    .match(/^(.+?)\s+or\s+(.+)$/i)
  if (!choices) return name
  const first = choices[1]!.trim()
  const second = choices[2]!.trim().split(/\s+/)
  // One word, then a choice that names what it's of: they share it.
  if (!/\s/.test(first) && second.length > 1) {
    return `${first} ${second.slice(1).join(" ")}`
  }
  return first
}

/**
 * The thing to buy as the list names it: without a measure ("Pinch of"),
 * how it's used ("to serve"), a second choice, or prep and sizes that
 * don't change what's bought. "Large onions, chopped" is "onions";
 * "lemon wedges to serve" is "lemon wedges".
 */
export function shoppingName(food: string) {
  const plain = bareFood(food.replace(HOW_MUCH, "").trim())
  return withoutPrep(firstChoice(plain)).replace(/\s+/g, " ").trim() || food
}

/**
 * The thing to buy in an ingredient line, as the list has it: its name
 * ("chicken thighs") and key ("chicken thigh"), or null when there's none.
 */
export function lineFood(line: string) {
  const parsed = parseIngredient(line)
  const name = shoppingName(parsed.food ?? parsed.text)
  return name ? { name, key: foodKey(name) } : null
}
