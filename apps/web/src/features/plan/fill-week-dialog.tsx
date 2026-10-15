import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, RefreshIcon } from "@hugeicons/core-free-icons"
import {
  MEAL_NAMES,
  type Meal,
  type MealSuggestion,
  type PlanEntry,
} from "@mise/shared"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatMinutes } from "@/features/recipes/format"
import { RecipeImage } from "@/features/recipes/recipe-image"
import { onSaleText } from "@/features/shop/sale-text"
import { ApiError } from "@/lib/api"

import { dayName, today } from "./dates"
import {
  useAddPlanEntries,
  useMealSuggestions,
  useSuggestMeal,
} from "./use-plan"

type Slot = { date: string; meal: Meal }
type Idea = Pick<MealSuggestion, "recipe" | "with" | "uses" | "onSale">

const slotKey = (slot: Slot) => `${slot.date}:${slot.meal}`

/**
 * Suggests recipes for the week's empty meals, from today on. Each idea can
 * be re-rolled or left out; nothing is added until "Add".
 */
export function FillWeekDialog({
  open,
  onOpenChange,
  days,
  meals,
  entries,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  days: string[]
  /** The meals the household plans. */
  meals: Meal[]
  /** What's already planned this week. */
  entries: PlanEntry[]
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Fill the week"
      description="Ideas from your recipes for the empty meals. Swap any you don't fancy."
    >
      {open && (
        <FillWeek
          days={days}
          meals={meals}
          entries={entries}
          onDone={() => onOpenChange(false)}
        />
      )}
    </ResponsiveDialog>
  )
}

function FillWeek({
  days,
  meals,
  entries,
  onDone,
}: {
  days: string[]
  meals: Meal[]
  entries: PlanEntry[]
  onDone: () => void
}) {
  const [chosen, setChosen] = React.useState<Meal[]>(
    meals.includes("dinner") ? ["dinner"] : meals
  )
  /** Re-rolled ideas, and ideas left out (null), by slot. */
  const [changes, setChanges] = React.useState<Record<string, Idea | null>>({})
  /** Ideas already passed over, so a re-roll doesn't bring them back. */
  const [passed, setPassed] = React.useState<string[]>([])
  const [rolling, setRolling] = React.useState<string | null>(null)
  const suggestOne = useSuggestMeal()
  const add = useAddPlanEntries()

  const now = today()
  const upcoming = days.filter((date) => date >= now)
  const taken = new Set(entries.map(slotKey))
  const slots = upcoming.flatMap((date) =>
    meals
      .filter((meal) => chosen.includes(meal))
      .map((meal) => ({ date, meal }))
      .filter((slot) => !taken.has(slotKey(slot)))
  )
  const suggestions = useMealSuggestions(slots)

  const fromServer = new Map(
    (suggestions.data ?? []).map((s) => [slotKey(s), s])
  )
  const rows = slots.flatMap((slot) => {
    const key = slotKey(slot)
    const idea = key in changes ? changes[key] : fromServer.get(key)
    return idea
      ? [
          {
            ...slot,
            key,
            recipe: idea.recipe,
            with: idea.with,
            uses: idea.uses,
            onSale: idea.onSale,
          },
        ]
      : []
  })
  const unfilled = slots.filter((slot) => {
    const key = slotKey(slot)
    return !(key in changes) && !fromServer.has(key)
  }).length

  function reroll(row: (typeof rows)[number]) {
    setRolling(row.key)
    const exclude = [
      ...new Set([...rows.map((r) => r.recipe.id), ...passed]),
    ].slice(0, 100)
    suggestOne.mutate(
      { slots: [{ date: row.date, meal: row.meal }], exclude },
      {
        onSuccess: ([next]) => {
          if (!next) {
            toast(
              `No other ideas for ${dayName(row.date)} ${MEAL_NAMES[row.meal].toLowerCase()}`
            )
            return
          }
          setPassed((ids) => [...ids, row.recipe.id])
          setChanges((current) => ({ ...current, [row.key]: next }))
        },
        onError: () => toast.error("Couldn't get another idea"),
        onSettled: () => setRolling(null),
      }
    )
  }

  function leaveOut(row: (typeof rows)[number]) {
    setChanges((current) => ({ ...current, [row.key]: null }))
  }

  function addAll() {
    add.mutate(
      rows.map((row) => ({
        date: row.date,
        meal: row.meal,
        recipeId: row.recipe.id,
        withRecipeId: row.with?.id ?? null,
      })),
      {
        onSuccess: (added) => {
          toast.success(
            `Added ${added.length} ${added.length === 1 ? "meal" : "meals"} to the plan`
          )
          onDone()
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't add those"
          ),
      }
    )
  }

  if (!upcoming.length) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        This week is over. Go to a later week to fill it.
      </p>
    )
  }

  return (
    <div className="grid gap-4">
      {meals.length > 1 && (
        <ToggleGroup
          type="multiple"
          variant="outline"
          value={chosen}
          onValueChange={(value) => {
            if (value.length) setChosen(value as Meal[])
          }}
          aria-label="Meals to fill"
          className="flex-wrap"
        >
          {meals.map((meal) => (
            <ToggleGroupItem key={meal} value={meal}>
              {MEAL_NAMES[meal]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {!slots.length ? (
        <p className="py-2 text-sm text-muted-foreground">
          Those meals are all planned for the rest of the week.
        </p>
      ) : suggestions.isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: Math.min(slots.length, 4) }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : suggestions.isError ? (
        <p className="py-2 text-sm text-muted-foreground">
          Couldn't get ideas. Try again in a moment.
        </p>
      ) : !rows.length ? (
        <p className="py-2 text-sm text-muted-foreground">
          {unfilled
            ? "Nothing new to suggest. Ideas come from your recipes, leaving out anything planned or made in the last two weeks, so add a few more. Tag breakfast and lunch recipes to have them suggested."
            : "Nothing left to add."}
        </p>
      ) : (
        <ul className="grid gap-1">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-3 py-1">
              <RecipeImage
                src={row.recipe.thumbnailUrl}
                alt=""
                className="size-11 shrink-0 rounded-lg"
              />
              <div className="grid min-w-0 flex-1">
                <span className="text-xs text-muted-foreground">
                  {dayName(row.date)} · {MEAL_NAMES[row.meal]}
                </span>
                <span className="truncate font-medium">
                  {row.recipe.name}
                  {row.with && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      with {row.with.name}
                    </span>
                  )}
                </span>
                {row.uses.length > 0 ? (
                  <span className="truncate text-xs font-medium text-amber-700 dark:text-amber-400">
                    Uses up your {row.uses.join(", ").toLowerCase()}
                  </span>
                ) : row.onSale.length > 0 ? (
                  <span className="truncate text-xs font-medium text-primary">
                    {onSaleText(row.onSale)}
                  </span>
                ) : row.recipe.totalMinutes ? (
                  <span className="text-xs text-muted-foreground">
                    {formatMinutes(row.recipe.totalMinutes)}
                  </span>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Something else for ${dayName(row.date)}`}
                title="Something else"
                disabled={rolling !== null}
                onClick={() => reroll(row)}
              >
                {rolling === row.key ? (
                  <Spinner />
                ) : (
                  <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Leave ${dayName(row.date)} empty`}
                title="Leave empty"
                onClick={() => leaveOut(row)}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && unfilled > 0 && (
        <p className="text-xs text-muted-foreground">
          No idea for {unfilled} {unfilled === 1 ? "meal" : "meals"}: nothing
          new in your recipes fits.
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant={rows.length ? "ghost" : "outline"} onClick={onDone}>
          {rows.length ? "Cancel" : "Close"}
        </Button>
        {rows.length > 0 && (
          <Button disabled={add.isPending} onClick={addAll}>
            {add.isPending && <Spinner data-icon="inline-start" />}
            Add {rows.length} {rows.length === 1 ? "meal" : "meals"}
          </Button>
        )}
      </div>
    </div>
  )
}
