import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { MEAL_NAMES, type Meal } from "@mise/shared"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatMinutes } from "@/features/recipes/format"
import { RecipeImage } from "@/features/recipes/recipe-image"
import { useRecipes } from "@/features/recipes/use-recipes"
import { ApiError } from "@/lib/api"

import { friendlyDay } from "./dates"
import { useAddPlanEntry } from "./use-plan"

const QUICK_NOTES = ["Leftovers", "Eating out", "Takeout", "Fend for yourself"]

/** Add a recipe or a note to one meal on one day. Picking a recipe adds it. */
export function AddEntryDialog({
  slot,
  onClose,
}: {
  slot: { date: string; meal: Meal } | null
  onClose: () => void
}) {
  return (
    <ResponsiveDialog
      open={slot !== null}
      onOpenChange={(open) => !open && onClose()}
      title={
        slot
          ? `${friendlyDay(slot.date)}: ${MEAL_NAMES[slot.meal].toLowerCase()}`
          : "Add a meal"
      }
    >
      {slot && <AddEntry slot={slot} onDone={onClose} />}
    </ResponsiveDialog>
  )
}

function AddEntry({
  slot,
  onDone,
}: {
  slot: { date: string; meal: Meal }
  onDone: () => void
}) {
  const [search, setSearch] = React.useState("")
  const [note, setNote] = React.useState("")
  const recipes = useRecipes({ q: search.trim() || undefined })
  const add = useAddPlanEntry()

  function addThis(input: { recipeId?: string; note?: string }, label: string) {
    add.mutate(
      { ...slot, ...input },
      {
        onSuccess: () => {
          toast.success(`Added ${label}`)
          onDone()
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't add that"
          ),
      }
    )
  }

  return (
    <Tabs defaultValue="recipe" className="min-h-0 gap-3">
      <TabsList className="w-full">
        <TabsTrigger value="recipe">Recipe</TabsTrigger>
        <TabsTrigger value="note">Note</TabsTrigger>
      </TabsList>

      <TabsContent value="recipe" className="grid min-h-0 gap-3">
        <InputGroup>
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            autoFocus
            placeholder="Search recipes"
            aria-label="Search recipes"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        <div className="grid max-h-[50dvh] min-h-40 content-start gap-1 overflow-y-auto">
          {recipes.isPending ? (
            <>
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </>
          ) : recipes.data?.length ? (
            recipes.data.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                disabled={add.isPending}
                className="flex items-center gap-3 rounded-xl p-2 text-left hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
                onClick={() => addThis({ recipeId: recipe.id }, recipe.name)}
              >
                <RecipeImage
                  src={recipe.thumbnailUrl}
                  alt=""
                  className="size-11 shrink-0 rounded-lg"
                />
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate font-medium">{recipe.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[
                      formatMinutes(recipe.totalMinutes),
                      recipe.servings && `${recipe.servings} servings`,
                      recipe.tags.slice(0, 3).join(", "),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search ? "No recipes match that." : "No recipes yet."}
            </p>
          )}
        </div>
      </TabsContent>

      <TabsContent value="note" className="grid gap-3">
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (note.trim()) addThis({ note: note.trim() }, note.trim())
          }}
        >
          <InputGroup>
            <InputGroupInput
              placeholder="Leftovers, eating out…"
              aria-label="Note"
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </InputGroup>
          <div className="flex flex-wrap gap-2">
            {QUICK_NOTES.map((quick) => (
              <Button
                key={quick}
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={add.isPending}
                onClick={() => addThis({ note: quick }, quick)}
              >
                {quick}
              </Button>
            ))}
          </div>
          <Button type="submit" disabled={!note.trim() || add.isPending}>
            Add note
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  )
}
