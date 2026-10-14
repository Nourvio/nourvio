import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { LeafIcon } from "@hugeicons/core-free-icons"
import {
  DIET_NAMES,
  dietConflicts,
  DIETS,
  dietsFor,
  type Diet,
  type DietOverrides,
  type Recipe,
} from "@mise/shared"
import { Link } from "react-router"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"

import { useSetDiets } from "./use-recipes"

/** The recipe's diet labels, each a link to recipes like it, and a way to correct them. */
export function DietBadges({
  recipe,
  onEdit,
}: {
  recipe: Recipe
  onEdit: () => void
}) {
  if (!recipe.diets.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <HugeiconsIcon
        icon={LeafIcon}
        strokeWidth={2}
        className="size-4 text-primary"
        aria-hidden
      />
      {recipe.diets.map((diet) => (
        <Badge key={diet} variant="outline" asChild>
          <Link to={`/recipes?diet=${diet}`}>{DIET_NAMES[diet]}</Link>
        </Badge>
      ))}
      <Button
        variant="link"
        size="sm"
        className="h-auto px-1 text-xs text-muted-foreground"
        onClick={onEdit}
      >
        Not right?
      </Button>
    </div>
  )
}

/** "2 tbsp butter, 1 cup cream and 2 more". */
function listOf(lines: string[]) {
  const shown = lines.slice(0, 2).join("; ")
  return lines.length > 2 ? `${shown} and ${lines.length - 2} more` : shown
}

/** Corrects the labels; only what differs from the ingredients is kept. */
export function DietDialog({
  recipe,
  open,
  onOpenChange,
}: {
  recipe: Recipe
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Diet labels"
      description="Worked out from the ingredients. If something's wrong, change it here; it sticks when the recipe is edited."
    >
      {open && <DietForm recipe={recipe} onDone={() => onOpenChange(false)} />}
    </ResponsiveDialog>
  )
}

function DietForm({ recipe, onDone }: { recipe: Recipe; onDone: () => void }) {
  const save = useSetDiets(recipe.id)
  const lines = recipe.ingredients.map((i) => i.text)
  const suggested = dietsFor(lines)
  const conflicts = dietConflicts(lines)
  const [checked, setChecked] = React.useState<Set<Diet>>(
    () => new Set(recipe.diets)
  )

  function submit(overrides: DietOverrides) {
    save.mutate(overrides, {
      onSuccess: () => {
        toast.success("Diet labels saved")
        onDone()
      },
      onError: (error) =>
        toast.error(
          error instanceof ApiError ? error.message : "Couldn't save that"
        ),
    })
  }

  const overrides: DietOverrides = {}
  for (const diet of DIETS) {
    if (checked.has(diet) !== suggested.includes(diet)) {
      overrides[diet] = checked.has(diet)
    }
  }
  const hasOverrides = Object.keys(recipe.dietOverrides).length > 0

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        submit(overrides)
      }}
    >
      <ul className="grid gap-3">
        {DIETS.map((diet) => {
          const id = `diet-${diet}`
          const changed = diet in overrides
          return (
            <li key={diet} className="flex items-start gap-3">
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={checked.has(diet)}
                onCheckedChange={(on) =>
                  setChecked((current) => {
                    const next = new Set(current)
                    if (on === true) next.add(diet)
                    else next.delete(diet)
                    return next
                  })
                }
              />
              <div className="grid gap-0.5">
                <Label htmlFor={id}>{DIET_NAMES[diet]}</Label>
                <span className="text-xs text-muted-foreground">
                  {conflicts[diet].length
                    ? `${changed ? "Set by you, though the recipe has" : "Ruled out by"} ${listOf(conflicts[diet])}`
                    : changed
                      ? "Set by you"
                      : "Nothing in the ingredients says otherwise"}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Packaged ingredients can surprise (stock, soy sauce, oats, chocolate).
        Check labels when it matters.
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {hasOverrides ? (
          <Button
            type="button"
            variant="ghost"
            disabled={save.isPending}
            onClick={() => submit({})}
          >
            Back to automatic
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Spinner data-icon="inline-start" />}
          Save
        </Button>
      </div>
    </form>
  )
}
