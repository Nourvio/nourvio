import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDataTransferHorizontalIcon } from "@hugeicons/core-free-icons"
import { formatIngredient, type RecipeIngredient } from "@mise/shared"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import type { SwappedFrom } from "./swaps"
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
  factorOf,
  checked,
  onToggle,
  highlighted,
  idPrefix = "ingredient",
  size = "md",
  onSwap,
  swappedFrom,
  onUndoSwap,
}: {
  ingredients: RecipeIngredient[]
  factor: number
  /** A different scale for some lines, like a sauce paired with this recipe. */
  factorOf?: (id: string) => number
  checked: Set<string>
  onToggle: (id: string) => void
  highlighted?: Set<string>
  idPrefix?: string
  size?: "md" | "lg"
  /** Offer "out of this?" on each line. */
  onSwap?: (ingredient: RecipeIngredient) => void
  /** Lines swapped in this time, and what they replaced. */
  swappedFrom?: SwappedFrom
  onUndoSwap?: (originalId: string) => void
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
              const swapped = swappedFrom?.get(ingredient.id)
              return (
                <li
                  key={ingredient.id}
                  className={cn(
                    "group flex items-start gap-3 rounded-xl px-2 py-1.5 transition-colors",
                    lit && "bg-accent text-accent-foreground"
                  )}
                >
                  <Checkbox
                    id={id}
                    checked={done}
                    onCheckedChange={() => onToggle(ingredient.id)}
                    className={size === "lg" ? "mt-1 size-5" : "mt-0.5"}
                  />
                  <div className="grid min-w-0 flex-1 gap-0.5">
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
                          factor={factorOf?.(ingredient.id) ?? factor}
                          unitGrams={grams ? ingredient.unitGrams : null}
                        />
                      </span>
                    </Label>
                    {swapped && ingredient.id.endsWith("~0") && (
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>Instead of {swapped.from}</span>
                        {onUndoSwap && (
                          <button
                            type="button"
                            onClick={() => onUndoSwap(swapped.originalId)}
                            className="font-medium text-primary hover:underline"
                          >
                            Undo
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                  {onSwap && !swapped && (
                    <button
                      type="button"
                      onClick={() => onSwap(ingredient)}
                      aria-label={`Out of ${ingredient.food ?? ingredient.text}? Swap it`}
                      title="Out of this? Swap it"
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity outline-none group-hover:opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:opacity-60"
                    >
                      <HugeiconsIcon
                        icon={ArrowDataTransferHorizontalIcon}
                        strokeWidth={2}
                        className="size-4"
                      />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
