import {
  formatIngredient,
  type RecipeIngredient,
  type RecipeStep,
  type Substitute,
} from "@mise/shared"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"

import { IngredientText } from "./ingredient-list"
import type { SwapChoice } from "./swaps"
import { useUnitMode } from "./unit-toggle"
import {
  useRestoreVersion,
  useSubstitutes,
  useSwapIngredient,
} from "./use-recipes"

/**
 * "Out of this?": substitutes for one ingredient that work in this recipe,
 * what's in the pantry first. Use one this time, or save it to the recipe.
 */
export function SwapDialog({
  recipeId,
  ingredient,
  steps,
  factor,
  canSave,
  onUse,
  onClose,
}: {
  recipeId: string
  ingredient: RecipeIngredient | null
  /** The steps on screen, to say which a swap changes. */
  steps: RecipeStep[]
  /** Amounts are shown at the scale on screen. */
  factor: number
  /** The ingredient is this recipe's own (not from something it's paired with). */
  canSave: boolean
  onUse: (ingredientId: string, choice: SwapChoice) => void
  onClose: () => void
}) {
  const [mode] = useUnitMode()
  // The amount being cooked, not the recipe's as written.
  const shown = ingredient
    ? (() => {
        const { amount, rest } = formatIngredient(
          ingredient.text,
          factor,
          mode === "grams" ? ingredient.unitGrams : null
        )
        return `${amount}${rest}`.trim()
      })()
    : null
  return (
    <ResponsiveDialog
      open={ingredient !== null}
      onOpenChange={(open) => !open && onClose()}
      title={shown ? `Instead of ${shown}` : "Swap"}
      description="Swaps that work in this recipe, with what you have first."
    >
      {ingredient && (
        <Options
          recipeId={recipeId}
          ingredient={ingredient}
          steps={steps}
          factor={factor}
          canSave={canSave}
          onUse={onUse}
          onClose={onClose}
        />
      )}
    </ResponsiveDialog>
  )
}

function Options({
  recipeId,
  ingredient,
  steps,
  factor,
  canSave,
  onUse,
  onClose,
}: {
  recipeId: string
  ingredient: RecipeIngredient
  steps: RecipeStep[]
  factor: number
  canSave: boolean
  onUse: (ingredientId: string, choice: SwapChoice) => void
  onClose: () => void
}) {
  const substitutes = useSubstitutes(recipeId, ingredient.id)
  const save = useSwapIngredient(recipeId)
  const restore = useRestoreVersion(recipeId)

  function saveToRecipe(substitute: Substitute) {
    save.mutate(
      {
        ingredientId: ingredient.id,
        lines: substitute.lines,
        steps: substitute.steps,
      },
      {
        onSuccess: ({ undoVersionId }) => {
          toast.success("Saved to the recipe", {
            description: `Instead of ${ingredient.text}.`,
            action: undoVersionId
              ? {
                  label: "Undo",
                  onClick: () =>
                    restore.mutate(undoVersionId, {
                      onSuccess: () => toast("Put back as it was"),
                    }),
                }
              : undefined,
          })
          onClose()
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't save that"
          ),
      }
    )
  }

  if (substitutes.isPending) {
    return (
      <div className="grid gap-3" role="status" aria-label="Finding swaps">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
    )
  }
  if (substitutes.isError) {
    return (
      <p className="text-sm text-muted-foreground">
        {substitutes.error instanceof ApiError
          ? substitutes.error.message
          : "Couldn't find swaps just now."}
      </p>
    )
  }
  if (!substitutes.data.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing good to swap in for this one. The assistant may have ideas if
        you ask.
      </p>
    )
  }
  return (
    <ul className="grid gap-3">
      {substitutes.data.map((substitute) => (
        <li
          key={substitute.lines.join("|")}
          className="grid gap-2 rounded-2xl border bg-card p-3.5"
        >
          <div className="flex items-start justify-between gap-3">
            <ul className="grid gap-0.5">
              {substitute.lines.map((line) => (
                <li key={line}>
                  <IngredientText text={line} factor={factor} />
                </li>
              ))}
            </ul>
            {substitute.inPantry && (
              <Badge variant="secondary" className="shrink-0">
                In your pantry
              </Badge>
            )}
          </div>
          {substitute.note && (
            <p className="text-sm text-muted-foreground">{substitute.note}</p>
          )}
          {substitute.steps.length > 0 && (
            <div className="grid gap-1 rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
              <p className="font-medium">
                {substitute.steps.length === 1
                  ? "Changes a step"
                  : `Changes ${substitute.steps.length} steps`}
              </p>
              <ul className="grid gap-1 text-muted-foreground">
                {substitute.steps.map((change) => {
                  const number =
                    steps.findIndex((step) => step.id === change.stepId) + 1
                  return (
                    <li key={change.stepId}>
                      {number > 0 && (
                        <span className="font-medium text-foreground">
                          Step {number}:{" "}
                        </span>
                      )}
                      {change.text}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                onUse(ingredient.id, {
                  lines: substitute.lines,
                  steps: substitute.steps,
                })
                toast.success("Swapped for this time")
                onClose()
              }}
            >
              Use this time
            </Button>
            {canSave && (
              <Button
                size="sm"
                variant="ghost"
                disabled={save.isPending}
                onClick={() => saveToRecipe(substitute)}
              >
                Save to recipe
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
