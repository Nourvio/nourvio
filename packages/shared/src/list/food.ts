import { findFood } from "../foods/vocabulary.ts"
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
export const FOOD_KEYS_VERSION = 8

/** Words that describe a size or freshness, not a different thing to buy. */
const DESCRIPTORS =
  /\b(extra[- ]large|large|medium|small|jumbo|fresh|freshly|ripe|organic|boneless|skinless)\b/g

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
 * A food's key, the same for every way of saying it: the key of the food
 * Merran knows in it, else its shopping name's plain form, as the synonyms
 * have it. "Chopped fresh flat-leaf parsley" and "parsley" are "parsley";
 * "plain flour" is "all-purpose flour".
 */
export function foodKey(food: string) {
  return named(food).key
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

/** Prep said after the food, without a comma: "carrots peeled and chopped". */
const PREP_AFTER =
  /(?:\s+(?:and|or)?\s*(?:(?:finely|roughly|coarsely|thinly)\s+)?(?:chopped|minced|diced|sliced|peeled|cubed|halved|quartered|trimmed|deseeded|seeded|cored|grated|shredded|crushed))+$/i

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
    const after = rest.match(PREP_AFTER)
    const food = after && after.index! > 0 ? rest.slice(0, after.index) : rest
    const aisle = guessAisle(food)
    if (aisle !== "produce" && aisle !== "meat-seafood") return rest
    if (food !== rest) {
      rest = food
      continue
    }
    const prep = rest.match(PREP)
    // Minced meat is a cut of its own: minced beef is ground beef.
    if (prep && aisle === "meat-seafood" && /minced/i.test(prep[0])) return rest
    const size = aisle === "produce" ? rest.match(SIZE) : null
    const off = prep ?? size
    if (!off || rest.length <= off[0].length) return rest
    rest = rest.slice(off[0].length)
  }
}

/** Words that say which of a food, so a choice can share the food. */
const WHICH =
  /^(?:yellow|white|red|green|brown|black|golden|purple|orange|sweet|hot|mild|dry|fresh|frozen|dried|light|dark|large|medium|small|unsalted|salted|whole|smoked|plain)$/i

/**
 * The first of two choices, said with "or" or a slash: "butter or
 * margarine" is butter, "sunflower or vegetable oil" sunflower oil, "medium
 * yellow or white onion" medium yellow onion, "chicken stock/broth" chicken
 * stock, "Chardonnay or other dry white wine" Chardonnay. When the second
 * comes with its own amount ("½ tsp Diamond Crystal or ¼ tsp Morton kosher
 * salt"), it's the one that names the food.
 */
function firstChoice(name: string) {
  const said = name
    .replace(/\s+and\/or\s+/gi, " or ")
    .replace(/\s+\/\s+/g, " or ")
    .replace(/(\p{L})\/(\p{L})/gu, "$1 or $2")
  const choices = said.match(/^(.+?)\s+or\s+(.+)$/i)
  if (!choices) return name
  const first = choices[1]!.trim()
  const second = choices[2]!.trim()
  // "Melted butter or ¼ cup vegetable oil" is butter; "½ tsp Diamond
  // Crystal or ¼ tsp Morton kosher salt", with no food first, the second.
  if (/^\d/.test(second)) {
    return findFood(first) ? first : (parseIngredient(second).food ?? first)
  }
  if (/^(?:other|another|any|similar)\b/i.test(second)) return first
  const a = first.split(/\s+/)
  const b = second.split(/\s+/)
  if (b.length < 2) return first
  const together = `${first} ${b.slice(1).join(" ")}`
  // "Sunflower or vegetable oil", "low-sodium chicken or vegetable broth":
  // the choice is which oil, which broth, when that's a food Merran knows
  // and the first choice's word is part of it. "Mayonnaise or plain Greek
  // yogurt" isn't mayonnaise yogurt.
  const known = findFood(together)
  if (known) {
    const word = a.at(-1)!.toLowerCase()
    const shares =
      known.name
        .toLowerCase()
        .split(/[\s-]+/)
        .includes(word) ||
      // "Fresh or frozen blueberries": the first isn't a food, only which.
      !findFood(first)
    return shares ? together : first
  }
  // A food it doesn't know: share it when the first only says which.
  const shared =
    (a.length === 1 || WHICH.test(a.at(-1)!)) &&
    a.at(-1)!.toLowerCase() !== b.at(-1)!.toLowerCase()
  return shared ? together : first
}

/** A label before the food: "Egg wash:", "Optional toppings:". */
const LABEL = /^[\p{L}\s-]{2,30}:\s+(?=\S)/u

/**
 * What's done to it said after it, which can name other foods: "onion cut
 * the same size as the potatoes", "egg beaten with 1 tbsp milk".
 */
const DONE_AFTER =
  /\s+(?:cut|sliced|chopped|diced)\s+(?:into|in|the|to|across|against|lengthwise)\b.*$|\s+(?:beaten|mixed|whisked|tossed|combined|blended)\s+with\b.*$/i

/** What it comes in, said before the food: "can chickpeas", "tube of". */
const CONTAINER =
  /^(?:\d+\s*x\s*)?(?:tubes?|cans?|tins?|jars?|packets?|packs?|bags?|boxes|box|bottles?|cartons?|tubs?|pouch(?:es)?)(?:\s+cans?)?(?:\s+of)?\s+/i

/** Zest or juice of a fruit is the fruit: "zest of half of a lemon". */
const ZEST_OF =
  /^(?:the\s+)?(?:zest|juice|rind|zest and juice|juice and zest)\s+of\s+(?:(?:half|½)\s+(?:of\s+)?)?(?:an?|one|the|\d+(?:\/\d+)?)?\s*(.+)$/i

/** What's in brackets, closed or not: "garlic cloves (" is garlic cloves. */
function noBrackets(name: string) {
  let rest = name
  for (let before = ""; before !== rest;) {
    before = rest
    rest = rest.replace(/\([^()]*\)/g, " ")
  }
  return rest.replace(/\(.*$/, " ").replace(/\)/g, " ")
}

/**
 * The thing to buy as the list names it: without what's in brackets, a
 * measure ("Pinch of"), how it's used ("to serve"), what it comes in ("can
 * chickpeas"), a second choice, or prep and sizes that don't change what's
 * bought. "Large onions, chopped" is "onions"; "lemon wedges to serve" is
 * "lemon wedges"; "zest of half of a lemon" is "lemon".
 */
export function shoppingName(food: string) {
  return named(food).name
}

/**
 * A food's name and key: a food Merran knows by the words that named it
 * and its own key ("King Arthur Unbleached All-Purpose Flour" is
 * "All-Purpose Flour", all-purpose flour); else the tidied words and their
 * plain form, as the synonyms have it.
 */
function named(food: string): { name: string; key: string; known: boolean } {
  let name = noBrackets(food).replace(/\*+/g, "").replace(/\s+/g, " ").trim()
  name = name.replace(LABEL, "").replace(DONE_AFTER, "")
  name = bareFood(name.replace(HOW_MUCH, "").trim())
  name = name.replace(ZEST_OF, "$1")
  const container = name.match(CONTAINER)
  if (container && name.length > container[0].length) {
    name = name.slice(container[0].length)
  }
  // "Large eggs and 2 large yolks": the first, which says what it is.
  name = name.replace(/\s+(?:and|plus)\s+\d.*$/i, "")
  name = firstChoice(name)
  const known = findFood(name)
  if (known) return { ...known, known: true }
  const shown = withoutPrep(name).replace(/\s+/g, " ").trim() || food
  const key = plainKey(shown)
  return { name: shown, key: FOOD_SYNONYMS[key] ?? key, known: false }
}

/**
 * The thing to buy in an ingredient line, as the list has it: its name
 * ("chicken thighs") and key ("chicken thigh"), or null when there's none.
 */
export function lineFood(line: string) {
  const found = foodInLine(line)
  return found && { name: found.name, key: found.key }
}

/**
 * The food in an ingredient line, and whether it's one Merran knows: for
 * seeing how much of a library the food vocabulary covers.
 */
export function foodInLine(line: string) {
  const parsed = parseIngredient(line)
  const found = named(parsed.food ?? parsed.text)
  return found.name ? found : null
}
