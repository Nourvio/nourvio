import { UNITS, type Unit } from "../units/units.ts"

const UNICODE_FRACTIONS: Record<string, string> = {
  "½": "1/2",
  "⅓": "1/3",
  "⅔": "2/3",
  "¼": "1/4",
  "¾": "3/4",
  "⅕": "1/5",
  "⅖": "2/5",
  "⅗": "3/5",
  "⅘": "4/5",
  "⅙": "1/6",
  "⅚": "5/6",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  dozen: 12,
  half: 0.5,
}

/** Words after "a" or "an" that make the amount vague, not one: "a few sprigs". */
const VAGUE_AFTER_A = new Set([
  "few",
  "couple",
  "little",
  "bit",
  "splash",
  "drizzle",
])

const NUMBER = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)`
const QUANTITY = new RegExp(
  `^(${NUMBER})(?:\\s*(?:-|–|—|to|or)\\s*(${NUMBER}))?`,
  "i"
)

// Single letters are case-sensitive: "t" is a teaspoon, "T" a tablespoon.
const CASE_SENSITIVE = new Map<string, Unit>()
const UNIT_LOOKUP = new Map<string, Unit>()
for (const unit of UNITS) {
  for (const key of [
    unit.name,
    unit.pluralName,
    unit.abbreviation,
    ...unit.aliases,
  ]) {
    if (!key) continue
    if (key.replace(/\./g, "").length === 1) CASE_SENSITIVE.set(key, unit)
    else UNIT_LOOKUP.set(key.toLowerCase().replace(/\.$/, ""), unit)
  }
}

function findUnit(token: string): Unit | undefined {
  const bare = token.replace(/\.$/, "")
  if (bare.length === 1) return CASE_SENSITIVE.get(bare)
  return UNIT_LOOKUP.get(bare.toLowerCase())
}

/** "1 1/2" → 1.5, "3/4" → 0.75, "1,5" → 1.5. */
export function parseNumber(text: string): number {
  const value = text.trim()
  const mixed = value.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const fraction = value.match(/^(\d+)\/(\d+)$/)
  if (fraction) return Number(fraction[1]) / Number(fraction[2])
  return Number(value.replace(",", "."))
}

/** Measures that come without a number, besides units: "a drizzle of". */
const MEASURE_WORDS = new Set([
  "splash",
  "drizzle",
  "sprinkle",
  "sprinkling",
  "squeeze",
  "squirt",
  "knob",
  "touch",
  "dollop",
  "glug",
  "bit",
  "drop",
  "drops",
])

/**
 * The food without a measure that has no number, or a bracket before it:
 * "Pinch of salt" is salt, "a few sprigs of thyme" thyme, "a little olive
 * oil" olive oil, "(75 g) butter" butter. What came off goes in `asides`.
 */
export function bareFood(text: string, asides: string[] = []): string {
  let rest = text.trim()
  const bracket = rest.match(/^\(([^)]+)\)\s*/)
  if (bracket && rest.length > bracket[0].length) {
    asides.push(bracket[1]!.trim())
    rest = rest.slice(bracket[0].length)
  }
  const words = rest.split(/\s+/)
  let at = 0
  const is = (pattern: RegExp) => pattern.test(words[at] ?? "")
  const article = is(/^(?:a|an|some)$/i)
  if (article) at++
  if (is(/^(?:good|generous|big|large|small|heaping|scant)$/i)) at++
  // "a few sprigs thyme" needs no "of" after the measure.
  const few = is(/^(?:few|couple)$/i)
  if (few) {
    at++
    if (is(/^of$/i)) at++
  }
  const measure = words[at] ?? ""
  // Nor does "a little olive oil".
  const little = article && /^little$/i.test(measure)
  const measured =
    little || findUnit(measure) || MEASURE_WORDS.has(measure.toLowerCase())
  if (!measured) {
    // "a few basil leaves": a few of the food itself.
    if (!few || at >= words.length) return rest
    asides.push(words.slice(0, at).join(" "))
    return words.slice(at).join(" ")
  }
  at++
  const of = is(/^of$/i)
  if (of) at++
  if ((!of && !few && !little) || at >= words.length) return rest
  asides.push(words.slice(0, of ? at - 1 : at).join(" "))
  return words.slice(at).join(" ")
}

/** "/ 240 ml " before the food: the amount another way. */
const OTHER_AMOUNT = new RegExp(String.raw`^\/\s*(${NUMBER}\s*([A-Za-z.]+))\s+`)

/**
 * The food after its amount without another way of measuring it: "(75 g)"
 * in "½ cup (75 g) butter", "plus 2 tbsp" in "1 cup plus 2 tbsp flour",
 * "/ 240 ml" in "1 cup / 240 ml milk". What came off goes in `asides`.
 */
function withoutOtherAmount(body: string, asides: string[]): string {
  let rest = body
  const plus = plusAmount(rest)
  if (plus) {
    asides.push(rest.slice(0, plus.length).trim())
    rest = rest.slice(plus.length).trim()
  }
  const bracket = rest.match(/^\(([^)]+)\)\s*/)
  if (bracket) {
    asides.push(bracket[1]!.trim())
    rest = rest.slice(bracket[0].length)
  }
  const slash = rest.match(OTHER_AMOUNT)
  if (slash && findUnit(slash[2]!)) {
    asides.push(slash[1]!)
    rest = rest.slice(slash[0].length)
  }
  rest = rest.replace(/^of\s+/i, "").trim()
  return rest || body
}

/** Only words that describe the food, before a comma that's between them. */
const DESCRIBING =
  /^(?:(?:boneless|skinless|bone-in|skin-on|fresh|large|medium|small|extra[- ]large|jumbo|ripe|firm|peeled|raw|cooked|uncooked|unsalted|salted|organic|whole|frozen|thawed|softened|lean|extra[- ]lean|thick[- ]cut|thin[- ]cut|seedless|pitted|dried|toasted|plain|low[- ]sodium|unsweetened|sweetened)(?:\s+|$|\s*and\s+))+$/i

/** Tidies an ingredient line: bullets gone, unicode fractions spelled out, spaces collapsed. */
export function normalizeIngredientLine(line: string) {
  return line
    .replace(/^\s*(?:[-–•*·▢□☐]|\d+[.)](?=\s))\s*/, "")
    .replace(/(\d)?([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_, whole: string, frac: string) =>
      whole ? `${whole} ${UNICODE_FRACTIONS[frac]}` : UNICODE_FRACTIONS[frac]!
    )
    .replace(/(\d)\s*⁄\s*(\d)/g, "$1/$2")
    .replace(/\s+/g, " ")
    .trim()
}

export type ParsedIngredient = {
  /** The tidied line, exactly what's shown when nothing is scaled. */
  text: string
  quantity: number | null
  /** The top of a range: 3 in "2 to 3 cloves". */
  quantityMax: number | null
  unitId: string | null
  food: string | null
  note: string | null
  /**
   * The line split around its amount, to show it with another amount:
   * `quantity + between + unit + rest` is the line as written.
   */
  parts: {
    quantity: string
    between: string
    unit: string
    rest: string
  } | null
}

/**
 * Reads an ingredient line as people write it: "2-3 cloves garlic, minced"
 * is 2 to 3 cloves of garlic, minced. What can't be read is left as text.
 */
export function parseIngredient(line: string): ParsedIngredient {
  const text = normalizeIngredientLine(line)
  let quantity: number | null = null
  let quantityMax: number | null = null
  let quantityText = ""

  const numeric = text.match(QUANTITY)
  if (numeric) {
    quantity = parseNumber(numeric[1]!)
    quantityMax = numeric[2] ? parseNumber(numeric[2]) : null
    quantityText = numeric[0]
  } else {
    const word = text.match(/^([a-z]+)\b/i)
    const value = word ? NUMBER_WORDS[word[1]!.toLowerCase()] : undefined
    const next = text
      .slice(word?.[0].length ?? 0)
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase()
    const vague = value === 1 && next !== undefined && VAGUE_AFTER_A.has(next)
    if (word && value !== undefined && !vague) {
      quantity = value
      quantityText = word[0]
    }
  }

  let cursor = quantityText.length
  let between = ""
  let sizeNote: string | null = null
  let unit: Unit | undefined
  let unitText = ""

  if (quantity !== null) {
    // "1 (14.5 oz) can tomatoes": the size in brackets belongs in the note.
    const size = text.slice(cursor).match(/^\s*\(([^)]+)\)/)
    if (size) {
      sizeNote = size[1]!.trim()
      between = size[0]
      cursor += size[0].length
    }

    const words = text
      .slice(cursor)
      .match(/^(\s*)([A-Za-z.]+)(?:(\s+)([A-Za-z.]+))?/)
    if (words) {
      const two = words[4] ? findUnit(`${words[2]} ${words[4]}`) : undefined
      if (two) {
        unit = two
        unitText = `${words[1]}${words[2]}${words[3]}${words[4]}`
      } else {
        unit = findUnit(words[2]!)
        if (unit) unitText = `${words[1]}${words[2]}`
      }
      cursor += unitText.length
    }
  }

  const afterUnit = text.slice(cursor)
  let body = (unit ? afterUnit.replace(/^\s+of\b/i, "") : afterUnit).trim()
  const asides: string[] = []
  if (unit) body = withoutOtherAmount(body, asides)
  else if (quantity === null) body = bareFood(body, asides)
  let note: string | null = null
  // A comma between describing words is part of the food: "skinless,
  // boneless chicken thighs, cut up" is skinless boneless chicken thighs.
  let comma = body.indexOf(",")
  while (comma > 0 && DESCRIBING.test(body.slice(0, comma).trim())) {
    body = `${body.slice(0, comma)}${body.slice(comma + 1)}`.replace(
      /\s+/g,
      " "
    )
    comma = body.indexOf(",", comma)
  }
  if (comma > 0) {
    note = body.slice(comma + 1).trim() || null
    body = body.slice(0, comma).trim()
  }
  const trailing = body.match(/\s*\(([^)]+)\)\s*$/)
  if (trailing) {
    note = [trailing[1]!.trim(), note].filter(Boolean).join(", ")
    body = body.slice(0, trailing.index).trim()
  }
  if (sizeNote || asides.length > 0) {
    note = [sizeNote, ...asides, note].filter(Boolean).join(", ")
  }

  return {
    text,
    quantity,
    quantityMax,
    unitId: unit?.id ?? null,
    food: body || null,
    note: note || null,
    parts:
      quantity === null
        ? null
        : { quantity: quantityText, between, unit: unitText, rest: afterUnit },
  }
}

/**
 * A weight in grams the line gives for itself: "(200 g)" in "1½ cups plus
 * 1 Tbsp. (200 g) flour", or "(1½ sticks; 169 g)".
 */
export function statedGrams(
  text: string
): { grams: number; start: number; end: number } | null {
  const match =
    /\((?:[^()]*?[;,]\s*)?(\d+(?:\.\d+)?)\s*(?:g|grams?)\.?\s*\)/i.exec(text)
  if (!match) return null
  return {
    grams: Number(match[1]),
    start: match.index,
    end: match.index + match[0].length,
  }
}

/** "plus 1 Tbsp." right after an amount, as in "1½ cups plus 1 Tbsp. flour". */
export function plusAmount(
  rest: string
): { quantity: number; unitId: string; length: number } | null {
  const lead = /^\s*plus\s+/i.exec(rest)
  if (!lead) return null
  const parsed = parseIngredient(rest.slice(lead[0].length))
  if (parsed.quantity === null || !parsed.unitId || !parsed.parts) return null
  const { quantity, between, unit } = parsed.parts
  const dot = /^\./.test(parsed.parts.rest) ? 1 : 0
  return {
    quantity: parsed.quantity,
    unitId: parsed.unitId,
    length:
      lead[0].length + quantity.length + between.length + unit.length + dot,
  }
}
