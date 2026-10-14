import { METRIC_UNIT_IDS, UNITS, type Unit } from "./units.ts"

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

/** Words after "a"/"an" that mean the amount is vague, not one ("a few sprigs"). */
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

// Unit lookup. Single letters are case-sensitive: "t" is a teaspoon, "T" a tablespoon.
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

export function parseNumber(text: string): number {
  const value = text.trim()
  const mixed = value.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const fraction = value.match(/^(\d+)\/(\d+)$/)
  if (fraction) return Number(fraction[1]) / Number(fraction[2])
  return Number(value.replace(",", "."))
}

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
  quantityMax: number | null
  unitId: string | null
  food: string | null
  note: string | null
  /**
   * The line split around the amount, for re-rendering with a scaled amount:
   * `quantity + between + unit + rest` is the original text.
   */
  parts: {
    quantity: string
    between: string
    unit: string
    rest: string
  } | null
}

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
  let note: string | null = null
  const comma = body.indexOf(",")
  if (comma > 0) {
    note = body.slice(comma + 1).trim() || null
    body = body.slice(0, comma).trim()
  }
  const trailing = body.match(/\s*\(([^)]+)\)\s*$/)
  if (trailing) {
    note = [trailing[1]!.trim(), note].filter(Boolean).join(", ")
    body = body.slice(0, trailing.index).trim()
  }
  if (sizeNote) note = [sizeNote, note].filter(Boolean).join(", ")

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

const FRACTIONS: [number, string][] = [
  [0, ""],
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
  [1, ""],
]

/**
 * Kitchen-friendly amounts: 1.5 → "1 ½", 0.333 → "⅓", 2.4 → "2 ⅜" (nearest
 * eighth or third). Metric amounts, big amounts and tiny ones stay decimal.
 */
export function formatQuantity(value: number, { metric = false } = {}) {
  if (!Number.isFinite(value)) return ""
  if (metric || value >= 20 || value < 0.1) {
    const rounded =
      value >= 10 ? Math.round(value) : Math.round(value * 100) / 100
    return String(rounded)
  }
  let whole = Math.floor(value)
  const remainder = value - whole
  let best = FRACTIONS[0]!
  for (const candidate of FRACTIONS) {
    if (Math.abs(candidate[0] - remainder) < Math.abs(best[0] - remainder)) {
      best = candidate
    }
  }
  if (best[0] === 1) {
    whole += 1
    best = FRACTIONS[0]!
  }
  if (!whole) return best[1] || "0"
  return best[1] ? `${whole} ${best[1]}` : String(whole)
}

/**
 * The ingredient line for display, split into the amount (with its unit) and
 * the rest. The amount is multiplied by `factor` and written the kitchen way
 * ("1 1/2" → "1 ½"); word amounts ("a pinch") stay as written when unscaled.
 * Lines without an amount come back with an empty `amount`.
 */
export function formatIngredient(
  line: string,
  factor = 1
): { amount: string; rest: string } {
  const parsed = parseIngredient(line)
  if (parsed.quantity === null || !parsed.parts) {
    return { amount: "", rest: parsed.text }
  }
  const { parts } = parsed
  if (factor === 1 && !/^\d/.test(parts.quantity)) {
    return {
      amount: parts.quantity + parts.between + parts.unit,
      rest: parts.rest,
    }
  }
  const metric = parsed.unitId ? METRIC_UNIT_IDS.has(parsed.unitId) : false
  const amount = parsed.quantity * factor
  let quantity = formatQuantity(amount, { metric })
  if (parsed.quantityMax !== null) {
    quantity += `–${formatQuantity(parsed.quantityMax * factor, { metric })}`
  }

  let unit = parts.unit
  const known = parsed.unitId ? UNITS.find((u) => u.id === parsed.unitId) : null
  if (known) {
    const word = unit.trim()
    const plural = (parsed.quantityMax ?? amount) > 1
    if (word.toLowerCase() === known.name && plural) {
      unit = unit.replace(word, known.pluralName)
    } else if (word.toLowerCase() === known.pluralName && !plural) {
      unit = unit.replace(word, known.name)
    }
  }
  return { amount: `${quantity}${parts.between}${unit}`, rest: parts.rest }
}

/** The ingredient line with its amount scaled, as one string. See formatIngredient. */
export function scaleIngredient(line: string, factor: number) {
  const { amount, rest } = formatIngredient(line, factor)
  return amount + rest
}

export type SectionedItem = { section: string | null; text: string }

/**
 * Splits editor lines into items with their section. A line starting with "#"
 * starts a section. With `colonHeadings`, a short line ending in ":" with no
 * amount does too ("For the sauce:"), which is common in pasted recipes.
 */
export function splitSections(
  lines: string[],
  { colonHeadings = false } = {}
): SectionedItem[] {
  const items: SectionedItem[] = []
  let section: string | null = null
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith("#")) {
      section = line.replace(/^#+/, "").trim().replace(/:$/, "") || null
      continue
    }
    if (
      colonHeadings &&
      line.endsWith(":") &&
      line.length <= 60 &&
      parseIngredient(line).quantity === null
    ) {
      section = line.slice(0, -1).trim() || null
      continue
    }
    items.push({ section, text: line })
  }
  return items
}

/** The reverse of splitSections: editor lines with "# Section" headings. */
export function joinSections(items: SectionedItem[]): string[] {
  const lines: string[] = []
  let section: string | null = null
  for (const item of items) {
    if (item.section !== section) {
      if (item.section) lines.push(`# ${item.section}`)
      section = item.section
    }
    lines.push(item.text)
  }
  return lines
}
