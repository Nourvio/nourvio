import * as React from "react"
import type { RecipeIngredient } from "@mise/shared"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export type UnitMode = "written" | "grams"

const STORAGE_KEY = "mise.units"
const listeners = new Set<() => void>()

function read(): UnitMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "grams" ? "grams" : "written"
  } catch {
    return "written"
  }
}

function write(mode: UnitMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Private windows can refuse; it just won't be remembered.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** As written or in grams, remembered on this device. */
export function useUnitMode() {
  const mode = React.useSyncExternalStore(subscribe, read, () => "written")
  return [mode, write] as const
}

/** Whether switching to grams would change anything ("2 eggs" wouldn't). */
export function canShowGrams(ingredients: RecipeIngredient[]) {
  return ingredients.some(
    (i) =>
      i.unitGrams !== null && i.unitId !== "gram" && i.unitId !== "kilogram"
  )
}

/** "As written" or "Grams" for a recipe's ingredients. */
export function UnitToggle({
  ingredients,
  className,
}: {
  ingredients: RecipeIngredient[]
  className?: string
}) {
  const [mode, setMode] = useUnitMode()
  if (!canShowGrams(ingredients)) return null
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={mode}
      onValueChange={(value) => value && setMode(value as UnitMode)}
      aria-label="Show amounts"
      className={className}
    >
      <ToggleGroupItem value="written">As written</ToggleGroupItem>
      <ToggleGroupItem value="grams">Grams</ToggleGroupItem>
    </ToggleGroup>
  )
}
