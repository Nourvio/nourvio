import * as React from "react"
import {
  parseIngredient,
  swapIntoStep,
  type RecipeIngredient,
  type RecipeStep,
  type StepChange,
  type StepSwap,
} from "@mise/shared"

/** What's used instead of an ingredient this time, and the steps that change with it. */
export type SwapChoice = { lines: string[]; steps?: StepChange[] }

/** An ingredient's id, and what's used instead of it this time. */
export type Swaps = Record<string, SwapChoice>

/** What a swapped-in line replaced: the original ingredient. */
export type SwappedFrom = Map<
  string,
  { originalId: string; from: string; original: RecipeIngredient }
>

// Swaps for this time only, per recipe. They carry between the recipe page
// and cooking it (and survive a reload there), and are let go when cooking
// is finished or the recipe is left for another page.
const listeners = new Set<() => void>()
const cache = new Map<string, Swaps>()
const NONE: Swaps = {}
const storageKey = (recipeId: string) => `mise.swaps.${recipeId}`

function read(recipeId: string): Swaps {
  const cached = cache.get(recipeId)
  if (cached) return cached
  let swaps = NONE
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(storageKey(recipeId)) ?? "null"
    )
    if (saved && typeof saved === "object") {
      // Swaps saved before steps could change were just the lines.
      swaps = Object.fromEntries(
        Object.entries(saved as Record<string, unknown>).map(([id, value]) => [
          id,
          Array.isArray(value)
            ? { lines: value as string[] }
            : (value as SwapChoice),
        ])
      )
    }
  } catch {
    // Nothing saved, or storage is blocked.
  }
  cache.set(recipeId, swaps)
  return swaps
}

function write(recipeId: string, swaps: Swaps) {
  cache.set(recipeId, swaps)
  try {
    if (Object.keys(swaps).length) {
      sessionStorage.setItem(storageKey(recipeId), JSON.stringify(swaps))
    } else {
      sessionStorage.removeItem(storageKey(recipeId))
    }
  } catch {
    // Not kept past this page; the swap still shows.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Forgets a recipe's swaps for this time, as when it's been cooked. */
export function clearSwaps(recipeId: string) {
  if (read(recipeId) !== NONE) write(recipeId, NONE)
}

// How many pages showing a recipe are open: the recipe page and its cook
// view hand over to each other, so its swaps last until both are gone.
const holders = new Map<string, number>()

/**
 * Keeps a recipe's swaps while this page is open. Going from the recipe to
 * cooking it (or back) keeps them; leaving for anywhere else lets them go,
 * so the next time starts with the recipe as written.
 */
export function useSwapsWhileOpen(recipeId: string) {
  React.useEffect(() => {
    holders.set(recipeId, (holders.get(recipeId) ?? 0) + 1)
    return () => {
      holders.set(recipeId, (holders.get(recipeId) ?? 1) - 1)
      // A moment for the next page to take them up (it may still be loading).
      setTimeout(() => {
        if (!holders.get(recipeId)) clearSwaps(recipeId)
      }, 1500)
    }
  }, [recipeId])
}

/** This time's swaps for a recipe, and ways to change them. */
export function useSwaps(recipeId: string) {
  const swaps = React.useSyncExternalStore(
    subscribe,
    () => read(recipeId),
    () => NONE
  )
  const swap = React.useCallback(
    (ingredientId: string, choice: SwapChoice) =>
      write(recipeId, { ...read(recipeId), [ingredientId]: choice }),
    [recipeId]
  )
  const undo = React.useCallback(
    (ingredientId: string) => {
      const next = { ...read(recipeId) }
      delete next[ingredientId]
      write(recipeId, next)
    },
    [recipeId]
  )
  return { swaps, swap, undo }
}

/** The ingredients with this time's swaps in their places, and what each swapped line replaced. */
export function applySwaps(
  ingredients: RecipeIngredient[],
  swaps: Swaps
): { ingredients: RecipeIngredient[]; swappedFrom: SwappedFrom } {
  const swappedFrom: SwappedFrom = new Map()
  if (!Object.keys(swaps).length) return { ingredients, swappedFrom }
  const result = ingredients.flatMap((ingredient) => {
    const lines = swaps[ingredient.id]?.lines
    if (!lines?.length) return [ingredient]
    return lines.map((text, index) => {
      const id = `${ingredient.id}~${index}`
      swappedFrom.set(id, {
        originalId: ingredient.id,
        from: ingredient.text,
        original: ingredient,
      })
      return {
        ...ingredient,
        id,
        text,
        quantity: null,
        quantityMax: null,
        unitId: null,
        // Named, so steps that use it light it up.
        food: parseIngredient(text).food,
        note: null,
        unitGrams: null,
      }
    })
  })
  return { ingredients: result, swappedFrom }
}

/** Each swapped ingredient's food, and the foods used instead, for writing into the steps. */
export function stepSwapsFor(
  ingredients: RecipeIngredient[],
  swappedFrom: SwappedFrom
) {
  const byOriginal = new Map<string, StepSwap>()
  for (const ingredient of ingredients) {
    const swapped = swappedFrom.get(ingredient.id)
    if (!swapped) continue
    const entry = byOriginal.get(swapped.originalId) ?? {
      from: swapped.original.food ?? swapped.original.text,
      to: [],
    }
    entry.to.push(ingredient.food ?? ingredient.text)
    byOriginal.set(swapped.originalId, entry)
  }
  const swaps = [...byOriginal.values()]
  // The rest of the recipe's foods, so their names aren't swapped by mistake.
  const others = ingredients
    .filter((ingredient) => !swappedFrom.has(ingredient.id) && ingredient.food)
    .map((ingredient) => ingredient.food!)
  return {
    swaps,
    /** A step as it reads with this time's swaps. */
    step: (text: string) => swapIntoStep(text, swaps, others),
  }
}

/** A step rewritten for a swap this time, and how it read before. */
export type ChangedStep = { original: string }

/** The steps with this time's swaps' changes in place ("simmer 15 minutes, until thick"). */
export function applyStepChanges(steps: RecipeStep[], swaps: Swaps) {
  const rewrites = new Map<string, string>()
  for (const choice of Object.values(swaps)) {
    for (const change of choice.steps ?? []) {
      rewrites.set(change.stepId, change.text)
    }
  }
  const changed = new Map<string, ChangedStep>()
  if (!rewrites.size) return { steps, changed }
  return {
    steps: steps.map((step) => {
      const text = rewrites.get(step.id)
      if (text === undefined) return step
      changed.set(step.id, { original: step.text })
      return { ...step, text }
    }),
    changed,
  }
}
