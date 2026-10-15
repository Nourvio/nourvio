import { z } from "zod"

import type { Diet } from "./diets.ts"
import { scaleIngredient } from "./ingredients.ts"
import {
  NUTRIENT_KEYS,
  type Nutrition,
  type Recipe,
  type RecipeIngredient,
  type RecipeInput,
  type RecipeStep,
} from "./recipes.ts"

/** A recipe offered alongside another: Teriyaki Sauce with Chicken + Rice. */
export type PairOption = {
  id: string
  slug: string
  name: string
  thumbnailUrl: string | null
  servings: number | null
  totalMinutes: number | null
}

/**
 * What a recipe goes with: particular recipes, or every recipe with a tag
 * ("any pasta sauce"), so new ones show up by themselves.
 */
export type Pairing =
  | { id: string; kind: "recipe"; recipe: PairOption }
  | { id: string; kind: "tag"; tag: string }

export type RecipePairings = {
  /** The rules, as set. */
  pairings: Pairing[]
  /** Every recipe they add up to, picked recipes first. */
  options: PairOption[]
  /** Recipes this one is offered with ("Pairs with Chicken + Rice"). */
  pairsWith: PairOption[]
}

export const addPairingsInput = z
  .object({
    recipes: z.array(z.uuid()).max(100).optional(),
    tag: z.string().trim().min(1).max(60).optional(),
  })
  .refine((input) => input.recipes?.length || input.tag, {
    message: "Pick a recipe or a tag",
  })
export type AddPairingsInput = z.infer<typeof addPairingsInput>

type Part = Pick<
  Recipe,
  | "id"
  | "name"
  | "servings"
  | "ingredients"
  | "steps"
  | "nutrition"
  | "diets"
  | "totalMinutes"
>

/**
 * How much of the paired recipe goes with the base: enough for the same
 * number of servings when both say how many they make, else one batch per
 * batch of the base.
 */
export function pairingFactor(base: Part, paired: Part, baseFactor = 1) {
  return base.servings && paired.servings
    ? (base.servings * baseFactor) / paired.servings
    : baseFactor
}

const label = (part: Part, section: string | null) =>
  section ? `${part.name} · ${section}` : part.name

/**
 * A recipe and what it's paired with, as one: the pairing's ingredients and
 * steps first (sauces get made first), each part under its own heading, the
 * pairing scaled to the servings, nutrition added up per serving, and only
 * the diet labels both share.
 */
export function pairRecipes(base: Part, paired: Part, baseFactor = 1) {
  const factor = pairingFactor(base, paired, baseFactor)
  const ingredients: RecipeIngredient[] = [
    ...paired.ingredients.map((i) => ({
      ...i,
      section: label(paired, i.section),
    })),
    ...base.ingredients.map((i) => ({ ...i, section: label(base, i.section) })),
  ]
  const steps: RecipeStep[] = [
    ...paired.steps.map((s) => ({ ...s, section: label(paired, s.section) })),
    ...base.steps.map((s) => ({ ...s, section: label(base, s.section) })),
  ]
  /** How much each line is scaled, by ingredient id. */
  const factors = new Map<string, number>([
    ...paired.ingredients.map((i): [string, number] => [i.id, factor]),
    ...base.ingredients.map((i): [string, number] => [i.id, baseFactor]),
  ])
  const diets: Diet[] = base.diets.filter((d) => paired.diets.includes(d))
  return {
    name: `${base.name} with ${paired.name}`,
    factor,
    ingredients,
    steps,
    factors,
    diets,
    nutrition: pairedNutrition(base, paired),
    totalMinutes:
      base.totalMinutes !== null || paired.totalMinutes !== null
        ? (base.totalMinutes ?? 0) + (paired.totalMinutes ?? 0)
        : null,
  }
}

/**
 * Per serving of the base, with its share of the pairing. Only when both
 * have nutrition and servings; a pairing scaled to the same servings adds
 * one of its own servings.
 */
function pairedNutrition(base: Part, paired: Part): Nutrition | null {
  const a = base.nutrition
  const b = paired.nutrition
  if (!a || !b || !base.servings || !paired.servings) return null
  const sources = [a.source, b.source]
  const combined = Object.fromEntries(
    NUTRIENT_KEYS.map((key) => {
      const x = a[key]
      const y = b[key]
      if (x === null && y === null) return [key, null]
      const sum = (x ?? 0) + (y ?? 0)
      return [key, Math.round(sum * 10) / 10]
    })
  ) as Omit<Nutrition, "source" | "notCounted">
  return {
    ...combined,
    calories: combined.calories === null ? null : Math.round(combined.calories),
    source: sources.includes("estimate")
      ? "estimate"
      : sources.includes("calculated")
        ? "calculated"
        : "site",
  }
}

/** The pairing as a recipe of its own, for "Save as a recipe". */
export function pairedRecipeInput(
  base: Part & Pick<Recipe, "tags">,
  paired: Part
): RecipeInput {
  const factor = pairingFactor(base, paired)
  const lines = (part: Part, scale: number, kind: "ingredients" | "steps") => {
    const out: string[] = []
    let section: string | null | undefined
    for (const item of part[kind]) {
      const heading = label(part, item.section)
      if (heading !== section) {
        out.push(`# ${heading}`)
        section = heading
      }
      out.push(
        kind === "ingredients" && scale !== 1
          ? scaleIngredient(item.text, scale)
          : item.text
      )
    }
    return out
  }
  return {
    name: `${base.name} with ${paired.name}`,
    servings: base.servings,
    totalMinutes: pairRecipes(base, paired).totalMinutes,
    tags: base.tags,
    ingredients: [
      ...lines(paired, factor, "ingredients"),
      ...lines(base, 1, "ingredients"),
    ],
    steps: [...lines(paired, 1, "steps"), ...lines(base, 1, "steps")],
  }
}
