import { z } from "zod"

import { DIET_NAMES, DIETS, dietsFor, type Diet } from "./diets.ts"

/** A food the household doesn't eat: who doesn't, and whether it's an allergy. */
export type AvoidedFood = {
  food: string
  who: string | null
  allergy: boolean
}

/** What the household eats and doesn't, for suggestions and the assistant. */
export type HouseholdTastes = {
  avoid: AvoidedFood[]
  /** Diets every meal must fit, like vegetarian. */
  diets: Diet[]
  /** Dinners Monday to Thursday take at most this long. */
  weeknightMinutes: number | null
  /** For the assistant: "no fish on Mondays", "the kids like it mild". */
  notes: string[]
}

export const NO_TASTES: HouseholdTastes = {
  avoid: [],
  diets: [],
  weeknightMinutes: null,
  notes: [],
}

const avoidedFood = z.object({
  food: z.string().trim().min(1, "Name the food").max(60),
  who: z.string().trim().max(40).nullable(),
  allergy: z.boolean(),
})

export const householdTastesInput = z.object({
  avoid: z.array(avoidedFood).max(100),
  diets: z.array(z.enum(DIETS)).max(DIETS.length),
  weeknightMinutes: z.number().int().min(10).max(240).nullable(),
  notes: z.array(z.string().trim().min(1).max(200)).max(50),
})

/** Choices for the weeknight dinner limit. */
export const WEEKNIGHT_MINUTES = [30, 45, 60] as const

/** Dinners on these days count as weeknights: Monday to Thursday. */
export const WEEKNIGHTS = [1, 2, 3, 4]

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
 * The household's avoided foods that a recipe's ingredients mention. `diets`
 * are the recipe's labels as shown (with any corrections); without them
 * they're worked out from the lines.
 */
export function avoidedIn(
  lines: string[],
  avoid: AvoidedFood[],
  diets?: Diet[]
): AvoidedFood[] {
  if (!avoid.length || !lines.length) return []
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
export function missingDiets(recipeDiets: Diet[], required: Diet[]) {
  return required.filter((diet) => !recipeDiets.includes(diet))
}

export type TasteWarning = { text: string; allergy: boolean }

/**
 * Why a recipe doesn't suit the household, in words ("Has mushroom: Jamie
 * doesn't eat it", "Not vegetarian"), allergies first. Empty when it suits.
 */
export function tasteWarnings(
  lines: string[],
  diets: Diet[],
  tastes: HouseholdTastes
): TasteWarning[] {
  const foods = avoidedIn(lines, tastes.avoid, diets)
    .sort((a, b) => Number(b.allergy) - Number(a.allergy))
    .map((item) => ({
      allergy: item.allergy,
      text: item.allergy
        ? `Has ${item.food}: ${item.who ? `${item.who} is allergic` : "an allergy here"}`
        : `Has ${item.food}${item.who ? `: ${item.who} doesn't eat it` : ""}`,
    }))
  const missing = missingDiets(diets, tastes.diets).map((diet) => ({
    allergy: false,
    text: `Not ${DIET_NAMES[diet].toLowerCase()}`,
  }))
  return [...foods, ...missing]
}

/** "Jamie doesn't eat mushrooms", "Allergy: peanuts (Sam)", "Not eaten: cilantro". */
export function describeAvoided(item: AvoidedFood) {
  if (item.allergy) {
    return `Allergy: ${item.food}${item.who ? ` (${item.who})` : ""}`
  }
  return item.who
    ? `${item.who} doesn't eat ${item.food}`
    : `Not eaten: ${item.food}`
}

/** A few lines for the assistant, or null when nothing's set. */
export function describeTastes(tastes: HouseholdTastes) {
  const lines = [
    ...tastes.avoid.map(describeAvoided),
    ...(tastes.diets.length
      ? [`Every meal must be: ${tastes.diets.join(", ")}`]
      : []),
    ...(tastes.weeknightMinutes
      ? [
          `Dinners Monday to Thursday: ${tastes.weeknightMinutes} minutes or less`,
        ]
      : []),
    ...tastes.notes,
  ]
  return lines.length ? lines.map((line) => `- ${line}`).join("\n") : null
}

/** Adds to the household's tastes, leaving out what's there already. */
export function mergeTastes(
  current: HouseholdTastes,
  added: Partial<HouseholdTastes>
): HouseholdTastes {
  const sameFood = (a: AvoidedFood, b: AvoidedFood) =>
    a.food.toLowerCase() === b.food.toLowerCase() &&
    (a.who ?? "").toLowerCase() === (b.who ?? "").toLowerCase()
  const avoid = [...current.avoid]
  for (const item of added.avoid ?? []) {
    const index = avoid.findIndex((a) => sameFood(a, item))
    if (index === -1) avoid.push(item)
    else if (item.allergy) avoid[index] = { ...avoid[index]!, allergy: true }
  }
  const notes = [...current.notes]
  for (const note of added.notes ?? []) {
    if (!notes.some((n) => n.toLowerCase() === note.toLowerCase())) {
      notes.push(note)
    }
  }
  return {
    avoid,
    diets: [...new Set([...current.diets, ...(added.diets ?? [])])],
    weeknightMinutes:
      added.weeknightMinutes !== undefined
        ? added.weeknightMinutes
        : current.weeknightMinutes,
    notes,
  }
}
