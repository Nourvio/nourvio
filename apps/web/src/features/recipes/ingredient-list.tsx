import { formatIngredient, type RecipeIngredient } from "@mise/shared"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import { useUnitMode } from "./unit-toggle"

/** Groups items by section, keeping their order. */
export function groupBySection<T extends { section: string | null }>(
  items: T[]
) {
  const groups: { section: string | null; items: T[] }[] = []
  for (const item of items) {
    const last = groups.at(-1)
    if (last && last.section === item.section) last.items.push(item)
    else groups.push({ section: item.section, items: [item] })
  }
  return groups
}

/** "2 cups flour, sifted", scaled, with the amount and unit in bold. */
export function IngredientText({
  text,
  factor = 1,
  unitGrams,
}: {
  text: string
  factor?: number
  /** Show the amount in grams, from this many grams per unit. */
  unitGrams?: number | null
}) {
  const { amount, rest } = formatIngredient(text, factor, unitGrams)
  return (
    <>
      {amount && <span className="font-semibold">{amount}</span>}
      {rest}
    </>
  )
}

/**
 * A checklist of ingredients, scaled by `factor`, with optional
 * highlighting, as written or in grams (the remembered choice).
 */
export function IngredientList({
  ingredients,
  factor,
  checked,
  onToggle,
  highlighted,
  idPrefix = "ingredient",
  size = "md",
}: {
  ingredients: RecipeIngredient[]
  factor: number
  checked: Set<string>
  onToggle: (id: string) => void
  highlighted?: Set<string>
  idPrefix?: string
  size?: "md" | "lg"
}) {
  const [mode] = useUnitMode()
  const grams = mode === "grams"
  if (!ingredients.length) {
    return <p className="text-muted-foreground">No ingredients listed.</p>
  }

  return (
    <div className="grid gap-5">
      {groupBySection(ingredients).map((group, index) => (
        <div key={`${group.section}-${index}`} className="grid gap-1">
          {group.section && (
            <h3 className="mb-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {group.section}
            </h3>
          )}
          <ul className="grid gap-0.5">
            {group.items.map((ingredient) => {
              const id = `${idPrefix}-${ingredient.id}`
              const done = checked.has(ingredient.id)
              const lit = highlighted?.has(ingredient.id)
              return (
                <li
                  key={ingredient.id}
                  className={cn(
                    "flex items-start gap-3 rounded-xl px-2 py-1.5 transition-colors",
                    lit && "bg-accent text-accent-foreground"
                  )}
                >
                  <Checkbox
                    id={id}
                    checked={done}
                    onCheckedChange={() => onToggle(ingredient.id)}
                    className={size === "lg" ? "mt-1 size-5" : "mt-0.5"}
                  />
                  <Label
                    htmlFor={id}
                    className={cn(
                      "leading-snug font-normal",
                      size === "lg" ? "text-lg" : "text-base",
                      done && "text-muted-foreground line-through"
                    )}
                  >
                    <span>
                      <IngredientText
                        text={ingredient.text}
                        factor={factor}
                        unitGrams={grams ? ingredient.unitGrams : null}
                      />
                    </span>
                  </Label>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
