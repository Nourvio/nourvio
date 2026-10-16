import { dietsFor, type Diet } from "../diets/diets.ts"

// What a household eats and doesn't: foods to avoid (allergies among them),
// diets every meal must fit, and how long weeknight dinners can take. Fill
// the week and the autoplan keep to them, without AI.

/** A food the household doesn't eat, and whether that's an allergy. */
export type AvoidedFood = { food: string; allergy: boolean }

export type HouseholdTastes = {
  avoid: AvoidedFood[]
  /** Diets every meal must fit, like vegetarian. */
  diets: Diet[]
  /** Dinners Monday to Thursday take at most this long. */
  weeknightMinutes: number | null
}

export const NO_TASTES: HouseholdTastes = {
  avoid: [],
  diets: [],
  weeknightMinutes: null,
}

/** Choices for the weeknight dinner limit. */
export const WEEKNIGHT_MINUTES = [30, 45, 60] as const

/** Dinners on these days count as weeknights: Monday to Thursday. */
export const WEEKNIGHTS: readonly number[] = [1, 2, 3, 4]

/**
 * Foods a diet label already checks carefully ("nuts" covers pesto and
 * almond flour, "dairy" covers butter and parmesan), so avoiding them uses
 * the label rather than the word.
 */
const FOOD_DIETS: Record<string, Diet> = {
  nut: "nut-free",
  nuts: "nut-free",
  "tree nut": "nut-free",
  "tree nuts": "nut-free",
  dairy: "dairy-free",
  "milk products": "dairy-free",
  gluten: "gluten-free",
  wheat: "gluten-free",
  egg: "egg-free",
  eggs: "egg-free",
  meat: "vegetarian",
}

/** "mushroom" also matches "mushrooms", "berry" matches "berries", and so on. */
function foodPattern(food: string) {
  const base = food
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, "")
    .replace(/\s+/g, " ")
  if (!base) return null
  const forms = new Set([base])
  if (base.endsWith("ies")) forms.add(`${base.slice(0, -3)}y`)
  else if (base.endsWith("es")) forms.add(base.slice(0, -2))
  if (base.endsWith("s")) forms.add(base.slice(0, -1))
  else {
    forms.add(`${base}s`)
    forms.add(`${base}es`)
    if (base.endsWith("y")) forms.add(`${base.slice(0, -1)}ies`)
  }
  const words = [...forms].map((form) =>
    form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")
  )
  return new RegExp(`\\b(?:${words.join("|")})\\b`, "i")
}

/**
 * The household's avoided foods a recipe's ingredients have. `diets` are
 * the recipe's labels as shown (corrections and all); without them they're
 * worked out from the lines.
 */
export function avoidedIn(
  lines: readonly string[],
  avoid: readonly AvoidedFood[],
  diets?: readonly Diet[]
): AvoidedFood[] {
  if (avoid.length === 0 || lines.length === 0) return []
  const text = lines.join("\n")
  let labels = diets
  return avoid.filter((item) => {
    const diet = FOOD_DIETS[item.food.trim().toLowerCase()]
    if (diet) {
      labels ??= dietsFor(lines)
      return !labels.includes(diet)
    }
    return foodPattern(item.food)?.test(text) ?? false
  })
}

/** The diets every meal must fit that a recipe doesn't. */
export function missingDiets(
  recipeDiets: readonly Diet[],
  required: readonly Diet[]
) {
  return required.filter((diet) => !recipeDiets.includes(diet))
}
