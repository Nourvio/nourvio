import { formatQuantity, parseIngredient } from "./ingredients.ts"
import type { StoreSectionId } from "./stores.ts"
import { METRIC_UNIT_IDS, UNITS, type Unit } from "./units.ts"

const UNIT_BY_ID = new Map(UNITS.map((unit) => [unit.id, unit]))

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
 * The thing to buy, normalized so the same food matches across recipes:
 * "2 Large Onions" and "1 onion" are both "onion".
 */
export function foodKey(food: string) {
  const words = food
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(DESCRIPTORS, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return food.toLowerCase().trim()
  words[words.length - 1] = singular(words[words.length - 1]!)
  return words.join(" ")
}

/** Keywords for a first guess at the aisle; the household's own choices win. */
const SECTION_WORDS: [StoreSectionId, RegExp][] = [
  [
    "spices",
    /\b(salt|pepper(corns?)?|paprika|cumin|cinnamon|nutmeg|oregano|thyme dried|dried \w+|chili powder|cayenne|turmeric|curry powder|garlic powder|onion powder|bay leaf|bay leaves|seasoning|allspice|ground (cumin|cinnamon|ginger|nutmeg|coriander|cloves|cardamom|turmeric|mustard)|red pepper flakes|vanilla|extract)\b/,
  ],
  // Before produce, meat and dairy: "chicken stock", "crushed tomatoes" and
  // "coconut milk" are canned; "peanut butter" is a condiment.
  [
    "canned-jarred",
    /\b(canned|can of|diced tomato|crushed tomato|whole tomato|tomato paste|tomato sauce|marinara|pasta sauce|black bean|kidney bean|pinto bean|cannellini|refried bean|baked bean|chickpea|garbanzo|lentil|broth|stock|coconut milk|tuna|olives|pickle|salsa|jam)\b/,
  ],
  [
    "condiments",
    /\b(ketchup|mustard|mayo|mayonnaise|soy sauce|tamari|fish sauce|hot sauce|sriracha|vinegar|worcestershire|bbq sauce|barbecue sauce|dressing|honey|maple syrup|hoisin|oyster sauce|miso|tahini|peanut butter)\b/,
  ],
  [
    "produce",
    /\b(onion|shallot|garlic|ginger|potato|sweet potato|carrot|celery|tomato|lettuce|spinach|kale|arugula|cabbage|broccoli|cauliflower|zucchini|squash|cucumber|pepper bell|bell pepper|jalapeno|jalapeño|chile|chili pepper|mushroom|avocado|lemon|lime|orange|apple|banana|berry|berries|strawberry|blueberry|raspberry|blackberry|grape|pear|peach|mango|pineapple|cilantro|parsley|basil|mint|thyme|rosemary|dill|chive|scallion|green onion|leek|corn on|asparagus|green bean|pea pod|radish|beet|herb|salad greens)\b/,
  ],
  [
    "meat-seafood",
    /\b(chicken|beef|steak|pork|bacon|sausage|ham|turkey|lamb|veal|ground|mince|chorizo|salmon|tuna steak|cod|tilapia|shrimp|prawn|scallop|fish|crab|lobster|thigh|breast|drumstick|wing|ribs?|brisket|roast)\b/,
  ],
  [
    "dairy-eggs",
    /\b(milk|buttermilk|cream|half and half|half-and-half|butter|yogurt|yoghurt|cheese|cheddar|mozzarella|parmesan|feta|ricotta|cream cheese|sour cream|egg|eggs)\b/,
  ],
  [
    "bakery",
    /\b(bread|baguette|bun|roll|tortilla|pita|naan|bagel|croissant|english muffin)\b/,
  ],
  [
    "pantry",
    /\b(flour|sugar|brown sugar|baking soda|baking powder|yeast|cornstarch|oil|olive oil|rice|pasta|spaghetti|noodle|oats|quinoa|couscous|breadcrumb|panko|cereal|cocoa|chocolate chip|nuts?|almond|walnut|pecan|raisin|cornmeal)\b/,
  ],
  ["frozen", /\b(frozen|ice cream)\b/],
  ["snacks", /\b(chips|crackers|pretzel|popcorn|cookies|granola bar)\b/],
  [
    "beverages",
    /\b(water|soda|pop|cola|pepsi|coke|sprite|juice|coffee|tea|beer|wine|seltzer|sparkling|lemonade|gatorade|energy drink)\b/,
  ],
  [
    "household",
    /\b(paper towel|toilet paper|tissue|napkin|trash bag|foil|plastic wrap|parchment|soap|detergent|dish|sponge|battery|batteries|shampoo|toothpaste)\b/,
  ],
]

/**
 * A first guess at the store section for a food or item name. Bought by the
 * can or jar means canned and jarred, whatever's in it.
 */
export function guessSection(
  name: string,
  unitId?: string | null
): StoreSectionId {
  const text = name.toLowerCase()
  // "Frozen peas" is frozen, not produce; "canned beans" canned, not pantry.
  if (/\bfrozen\b/.test(text)) return "frozen"
  if (unitId === "can" || unitId === "jar") return "canned-jarred"
  if (/\b(canned|can of|jarred)\b/.test(text)) return "canned-jarred"
  // Try the singular too: "paper towels" should match "paper towel".
  const forms = [text, foodKey(text)]
  for (const [section, words] of SECTION_WORDS) {
    if (forms.some((form) => words.test(form))) return section
  }
  return "other"
}

/** How-much phrases that aren't part of the thing to buy: "Salt to taste". */
const HOW_MUCH =
  /\s+(to taste|as needed|if needed|for (serving|garnish|drizzling|frying|dusting|the pan|greasing)|optional)\b.*$/i

export type ListLine = {
  /** An ingredient line as written, "1 ½ cups milk". */
  text: string
  /** How much the recipe is scaled by in the plan. */
  factor: number
  /** Where it's from, like a recipe name. */
  source: string
  /** The planned meal it's for. */
  entryId?: string
}

export type CombinedItem = {
  /** Same key, same thing to buy (and units that can be added up). */
  key: string
  name: string
  quantity: number | null
  unitId: string | null
  sources: string[]
  /** The planned meals it's for. */
  entries: string[]
}

type Group = {
  key: string
  name: string
  kind: "volume" | "weight" | "count" | "none"
  /** Total in ml or g for volume and weight; in the unit (or each) otherwise. */
  total: number | null
  unitId: string | null
  /** The unit to show volume and weight in: the biggest one used. */
  showUnit: Unit | null
  sources: Set<string>
  entries: Set<string>
}

/**
 * Adds up ingredient lines into a shopping list: the same food is combined
 * across recipes, volumes and weights are converted when added, and counts
 * stay in their own unit (2 cans and 1 lb of tomatoes stay apart). Lines
 * without an amount ("salt to taste") are listed once, without one.
 */
export function combineLines(lines: ListLine[]): CombinedItem[] {
  const groups = new Map<string, Group>()

  for (const line of lines) {
    const parsed = parseIngredient(line.text)
    const name = (parsed.food ?? parsed.text).replace(HOW_MUCH, "").trim()
    if (!name) continue
    const food = foodKey(name)
    const unit = parsed.unitId ? UNIT_BY_ID.get(parsed.unitId) : undefined
    // Buy enough for the top of a range ("2-3 cloves").
    const amount = parsed.quantityMax ?? parsed.quantity
    const kind: Group["kind"] =
      amount === null
        ? "none"
        : unit?.kind === "volume" || unit?.kind === "weight"
          ? unit.kind
          : "count"
    const key =
      kind === "volume" || kind === "weight"
        ? `${food}|${kind}`
        : kind === "count"
          ? `${food}|${unit?.id ?? "each"}`
          : `${food}|none`

    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        name,
        kind,
        total: kind === "none" ? null : 0,
        unitId: kind === "count" ? (unit?.id ?? null) : null,
        showUnit: null,
        sources: new Set(),
        entries: new Set(),
      }
      groups.set(key, group)
    }
    group.sources.add(line.source)
    if (line.entryId) group.entries.add(line.entryId)
    if (amount === null || group.total === null) continue

    const scaled = amount * line.factor
    if (kind === "volume" || kind === "weight") {
      group.total += scaled * unit!.toBase!
      if (!group.showUnit || unit!.toBase! > group.showUnit.toBase!) {
        group.showUnit = unit!
      }
    } else {
      group.total += scaled
    }
  }

  // A food with an amount somewhere doesn't also need an "as needed" line.
  for (const [key, group] of groups) {
    if (group.kind !== "none") continue
    const food = key.slice(0, -"|none".length)
    const sibling = [...groups.values()].find(
      (other) => other !== group && other.key.startsWith(`${food}|`)
    )
    if (sibling) {
      for (const source of group.sources) sibling.sources.add(source)
      for (const entry of group.entries) sibling.entries.add(entry)
      groups.delete(key)
    }
  }

  return [...groups.values()].map((group) => {
    let quantity = group.total
    let unitId = group.unitId
    if (group.showUnit && quantity !== null) {
      quantity = quantity / group.showUnit.toBase!
      unitId = group.showUnit.id
    }
    return {
      key: group.key,
      name: group.name,
      quantity: quantity === null ? null : Math.round(quantity * 1000) / 1000,
      unitId,
      sources: [...group.sources],
      entries: [...group.entries],
    }
  })
}

/** "1 ½ cups", "3", "2 cans", "500 g". Empty when there's no amount. */
export function formatAmount(quantity: number | null, unitId: string | null) {
  if (quantity === null) return ""
  const unit = unitId ? UNIT_BY_ID.get(unitId) : undefined
  const metric = unitId ? METRIC_UNIT_IDS.has(unitId) : false
  const number = formatQuantity(quantity, { metric })
  if (!unit) return number
  // "2 lb" and "1 tbsp" read fine; "2 c" doesn't, so cups are spelled out.
  const label =
    unit.abbreviation && unit.kind !== "count" && unit.id !== "cup"
      ? unit.abbreviation
      : quantity > 1
        ? unit.pluralName
        : unit.name
  return `${number} ${label}`
}

/**
 * What's left of one amount after taking another, in the first one's unit:
 * the same unit, or volumes and weights converted. Null when they can't be
 * compared (or either has no amount). Can go below zero.
 */
export function subtractAmounts(
  have: { quantity: number | null; unitId: string | null },
  take: { quantity: number | null; unitId: string | null }
): { quantity: number; unitId: string | null } | null {
  if (have.quantity === null || take.quantity === null) return null
  const round = (n: number) => Math.round(n * 1000) / 1000
  if (have.unitId === take.unitId) {
    return {
      quantity: round(have.quantity - take.quantity),
      unitId: have.unitId,
    }
  }
  const uh = have.unitId ? UNIT_BY_ID.get(have.unitId) : undefined
  const ut = take.unitId ? UNIT_BY_ID.get(take.unitId) : undefined
  if (uh && ut && uh.kind === ut.kind && uh.toBase && ut.toBase) {
    return {
      quantity: round(
        (have.quantity * uh.toBase - take.quantity * ut.toBase) / uh.toBase
      ),
      unitId: have.unitId,
    }
  }
  return null
}

/**
 * Adds one amount to another when they can be added: the same count unit,
 * or volumes and weights (converted, shown in the bigger unit). Returns
 * null when they can't, so the caller keeps them apart.
 */
export function addAmounts(
  a: { quantity: number | null; unitId: string | null },
  b: { quantity: number | null; unitId: string | null }
): { quantity: number | null; unitId: string | null } | null {
  if (a.quantity === null || b.quantity === null) {
    return a.unitId === b.unitId
      ? { quantity: a.quantity ?? b.quantity, unitId: a.unitId }
      : null
  }
  const ua = a.unitId ? UNIT_BY_ID.get(a.unitId) : undefined
  const ub = b.unitId ? UNIT_BY_ID.get(b.unitId) : undefined
  if (a.unitId === b.unitId) {
    return { quantity: a.quantity + b.quantity, unitId: a.unitId }
  }
  if (ua && ub && ua.kind === ub.kind && ua.toBase && ub.toBase) {
    const bigger = ua.toBase >= ub.toBase ? ua : ub
    const total = a.quantity * ua.toBase + b.quantity * ub.toBase
    return {
      quantity: Math.round((total / bigger.toBase!) * 1000) / 1000,
      unitId: bigger.id,
    }
  }
  return null
}
