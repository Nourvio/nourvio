import type { RecipeIngredient } from "@mise/shared"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { storedChoice } from "@/lib/stored-choice"

export type UnitMode = "written" | "grams"

/** As written or in grams, remembered on this device. */
export const useUnitMode = storedChoice<UnitMode>(
  "mise.units",
  ["written", "grams"],
  "written"
)

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
