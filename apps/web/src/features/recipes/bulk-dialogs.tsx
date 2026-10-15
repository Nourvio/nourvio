import * as React from "react"
import {
  addDays,
  DEFAULT_MEALS,
  MEAL_NAMES,
  type Meal,
  type RecipeSummary,
} from "@mise/shared"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { monthDay, shortDayName, today } from "@/features/plan/dates"
import { useAddPlanEntries, usePlan } from "@/features/plan/use-plan"
import { useHouseholdInfo } from "@/features/settings/use-household"
import { ApiError, api } from "@/lib/api"

import { useRecipeBulk, useTags } from "./use-recipes"

const failed = (error: unknown, fallback: string) =>
  toast.error(error instanceof ApiError ? error.message : fallback)

/** "Tacos, Pesto Pasta and 3 more" */
function namesOf(recipes: RecipeSummary[]) {
  const names = recipes.map((recipe) => recipe.name)
  return names.length <= 3
    ? names.join(", ")
    : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`
}

/**
 * Selected recipes onto the plan: one each on the next open dinners (or the
 * household's main meal), from today.
 */
export function PlanRecipesDialog({
  recipes,
  open,
  onOpenChange,
  onDone,
}: {
  recipes: RecipeSummary[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const household = useHouseholdInfo().data
  const meals = household?.meals ?? DEFAULT_MEALS
  const meal: Meal = meals.includes("dinner") ? "dinner" : meals.at(-1)!
  const from = today()
  const plan = usePlan(from, addDays(from, 41))
  const add = useAddPlanEntries()

  const slots: string[] = []
  if (plan.data) {
    const taken = new Set(
      plan.data
        .filter((entry) => entry.meal === meal)
        .map((entry) => entry.date)
    )
    for (let day = 0; day < 42 && slots.length < recipes.length; day++) {
      const date = addDays(from, day)
      if (!taken.has(date)) slots.push(date)
    }
  }
  const rows = recipes.slice(0, slots.length).map((recipe, index) => ({
    recipe,
    date: slots[index]!,
  }))

  function addAll() {
    add.mutate(
      rows.map((row) => ({ date: row.date, meal, recipeId: row.recipe.id })),
      {
        onSuccess: () => {
          toast.success(
            `Planned ${rows.length} ${rows.length === 1 ? MEAL_NAMES[meal].toLowerCase() : `${MEAL_NAMES[meal].toLowerCase()}s`}`
          )
          onDone()
        },
        onError: (error) => failed(error, "Couldn't plan those"),
      }
    )
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Plan ${recipes.length === 1 ? "this recipe" : `these ${recipes.length} recipes`}`}
      description={`One each on the next open ${MEAL_NAMES[meal].toLowerCase()}s, from today.`}
    >
      {plan.isPending ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Spinner /> Finding open days…
        </p>
      ) : (
        <div className="grid gap-4">
          <ul className="grid gap-1.5">
            {rows.map((row) => (
              <li
                key={row.recipe.id}
                className="flex items-baseline justify-between gap-3 rounded-2xl bg-secondary/60 px-3.5 py-2.5"
              >
                <span className="min-w-0 truncate font-medium">
                  {row.recipe.name}
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {shortDayName(row.date)}, {monthDay(row.date)}
                </span>
              </li>
            ))}
          </ul>
          {rows.length < recipes.length && (
            <p className="text-sm text-muted-foreground">
              Only {rows.length} open {MEAL_NAMES[meal].toLowerCase()}s in the
              next six weeks.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!rows.length || add.isPending} onClick={addAll}>
              {add.isPending && <Spinner data-icon="inline-start" />}
              Plan {rows.length}
            </Button>
          </div>
        </div>
      )}
    </ResponsiveDialog>
  )
}

/** Tags onto selected recipes, or off them. */
export function TagRecipesDialog({
  ids,
  open,
  onOpenChange,
}: {
  ids: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const tags = useTags().data ?? []
  const bulk = useRecipeBulk()
  const [text, setText] = React.useState("")
  const names = text
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
  const listId = React.useId()

  function run(action: "addTags" | "removeTags") {
    bulk.mutate(
      { action, ids, tags: names },
      {
        onSuccess: ({ changed }) => {
          toast.success(
            action === "addTags"
              ? `Tagged ${changed} ${changed === 1 ? "recipe" : "recipes"}`
              : `Took the tag off ${changed} ${changed === 1 ? "recipe" : "recipes"}`
          )
          setText("")
          onOpenChange(false)
        },
        onError: (error) => failed(error, "Couldn't change the tags"),
      }
    )
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Tags for ${ids.length} ${ids.length === 1 ? "recipe" : "recipes"}`}
      description="Several at once, separated by commas."
    >
      <div className="grid gap-4">
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="to try, weeknight"
          list={listId}
          aria-label="Tags"
          autoFocus
        />
        <datalist id={listId}>
          {tags.map((tag) => (
            <option key={tag.name} value={tag.name} />
          ))}
        </datalist>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 12).map((tag) => (
              <button
                key={tag.name}
                type="button"
                onClick={() =>
                  setText((current) =>
                    current.trim()
                      ? `${current.replace(/,\s*$/, "")}, ${tag.name}`
                      : tag.name
                  )
                }
                className="rounded-full border px-3 py-1 text-sm outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            disabled={!names.length || bulk.isPending}
            onClick={() => run("removeTags")}
          >
            Take off
          </Button>
          <Button
            disabled={!names.length || bulk.isPending}
            onClick={() => run("addTags")}
          >
            {bulk.isPending && <Spinner data-icon="inline-start" />}
            Add to {ids.length}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  )
}

/** "Delete 4 recipes?": to Recently deleted, with Undo. */
export function DeleteRecipesDialog({
  recipes,
  open,
  onOpenChange,
  onDeleted,
}: {
  recipes: RecipeSummary[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const bulk = useRecipeBulk()
  const ids = recipes.map((recipe) => recipe.id)
  const one = recipes.length === 1

  function remove() {
    bulk.mutate(
      { action: "delete", ids },
      {
        onSuccess: ({ changed }) => {
          onDeleted()
          toast(
            `${changed} ${changed === 1 ? "recipe" : "recipes"} moved to Recently deleted`,
            {
              duration: 10_000,
              action: {
                label: "Undo",
                onClick: () => bulk.mutate({ action: "restore", ids }),
              },
            }
          )
        },
        onError: (error) => failed(error, "Couldn't delete those"),
      }
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {one ? recipes[0]?.name : `${recipes.length} recipes`}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {one ? "It goes" : "They go"} to Recently deleted for 30 days, then{" "}
            {one ? "it's" : "they're"} gone for good. Planned meals using{" "}
            {one ? "it" : "them"} come off the plan, and back if{" "}
            {one ? "it's" : "they're"} restored.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!one && <p className="text-sm">{namesOf(recipes)}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={remove}>
            {one ? "Delete" : `Delete ${recipes.length}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** The selected recipes as a JSON file to keep. */
export async function exportRecipes(recipes: RecipeSummary[]) {
  const full = []
  for (const recipe of recipes) {
    full.push((await api<{ recipe: unknown }>(`/recipes/${recipe.id}`)).recipe)
  }
  const blob = new Blob(
    [JSON.stringify({ exportedFrom: "Nourvio", recipes: full }, null, 2)],
    { type: "application/json" }
  )
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `nourvio-recipes-${today()}.json`
  link.click()
  URL.revokeObjectURL(url)
}
