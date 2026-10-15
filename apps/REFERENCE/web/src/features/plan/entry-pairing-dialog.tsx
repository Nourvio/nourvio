import type { PlanEntry } from "@mise/shared"
import { Link } from "react-router"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { usePairings } from "@/features/recipes/use-recipes"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

import { useUpdatePlanEntry } from "./use-plan"

/** Picks what a planned meal is made with, from what its recipe goes with. */
export function EntryPairingDialog({
  entry,
  onClose,
}: {
  entry: PlanEntry | null
  onClose: () => void
}) {
  return (
    <ResponsiveDialog
      open={entry !== null}
      onOpenChange={(open) => !open && onClose()}
      title={
        entry?.recipe ? `What goes with ${entry.recipe.name}?` : "Goes with"
      }
    >
      {entry?.recipe && <PickPairing entry={entry} onDone={onClose} />}
    </ResponsiveDialog>
  )
}

function PickPairing({
  entry,
  onDone,
}: {
  entry: PlanEntry
  onDone: () => void
}) {
  const recipe = entry.recipe!
  const pairings = usePairings(recipe.id)
  const update = useUpdatePlanEntry()
  const options = pairings.data?.options ?? []

  function choose(id: string | null, name: string | null) {
    update.mutate(
      { id: entry.id, withRecipeId: id },
      {
        onSuccess: () => {
          toast.success(name ? `With ${name}` : `Just ${recipe.name}`)
          onDone()
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't save that"
          ),
      }
    )
  }

  if (pairings.isPending) return <Skeleton className="h-32" />
  if (!options.length) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        Nothing's set to go with it yet.{" "}
        <Link
          to={`/recipes/${recipe.slug}`}
          className="font-medium text-primary hover:underline"
          onClick={onDone}
        >
          Add sauces or sides on the recipe
        </Link>
        .
      </p>
    )
  }
  const current = entry.with?.id ?? null
  const row =
    "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-secondary/50 disabled:opacity-60"
  return (
    <ul className="grid grid-cols-1 divide-y overflow-hidden rounded-xl border">
      {[{ id: null, name: `Just ${recipe.name}` }, ...options].map((option) => {
        const on = option.id === current
        return (
          <li key={option.id ?? "none"}>
            <button
              type="button"
              aria-pressed={on}
              disabled={update.isPending}
              className={cn(row, on && "bg-primary/5 font-medium")}
              onClick={() => choose(option.id, option.id ? option.name : null)}
            >
              <span className="min-w-0 truncate">{option.name}</span>
              {on && <span className="text-xs text-primary">Planned</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
