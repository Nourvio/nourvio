import * as React from "react"
import type { RecipeIngredient } from "@mise/shared"

/** An ingredient's id, and the lines used instead of it this time. */
export type Swaps = Record<string, string[]>

/** What a swapped-in line replaced. */
export type SwappedFrom = Map<string, { originalId: string; from: string }>

// Swaps for this time only, per recipe, kept for the browser session so
// they carry from the recipe page into cooking.
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
    if (saved && typeof saved === "object") swaps = saved as Swaps
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

/** This time's swaps for a recipe, and ways to change them. */
export function useSwaps(recipeId: string) {
  const swaps = React.useSyncExternalStore(
    subscribe,
    () => read(recipeId),
    () => NONE
  )
  const swap = React.useCallback(
    (ingredientId: string, lines: string[]) =>
      write(recipeId, { ...read(recipeId), [ingredientId]: lines }),
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
    const lines = swaps[ingredient.id]
    if (!lines?.length) return [ingredient]
    return lines.map((text, index) => {
      const id = `${ingredient.id}~${index}`
      swappedFrom.set(id, { originalId: ingredient.id, from: ingredient.text })
      return {
        ...ingredient,
        id,
        text,
        quantity: null,
        quantityMax: null,
        unitId: null,
        food: null,
        note: null,
        unitGrams: null,
      }
    })
  })
  return { ingredients: result, swappedFrom }
}
