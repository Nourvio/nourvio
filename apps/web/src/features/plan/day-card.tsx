import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  CookingPotIcon,
  MoreHorizontalIcon,
  Note01Icon,
  RefreshIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import {
  MEAL_NAMES,
  MEALS,
  planTotals,
  type Meal,
  type PlanEntry,
} from "@mise/shared"
import { Link } from "react-router"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatMinutes } from "@/features/recipes/format"
import { RecipeImage } from "@/features/recipes/recipe-image"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

import { cookLink } from "./cook-link"
import { dayName, monthDay } from "./dates"
import { EntryPairingDialog } from "./entry-pairing-dialog"
import {
  useRemovePlanEntry,
  useSetEntryStatus,
  useSuggestMeal,
  useUpdatePlanEntry,
} from "./use-plan"

/**
 * One day of the plan. Meals with something planned are listed in order;
 * empty meals shrink to small "+ Lunch" buttons, so a sparse week stays tidy.
 */
export function DayCard({
  date,
  isToday,
  isPast,
  meals,
  entries,
  onAdd,
  onEdit,
}: {
  date: string
  isToday: boolean
  isPast: boolean
  meals: Meal[]
  entries: PlanEntry[]
  onAdd: (meal: Meal) => void
  onEdit: (entry: PlanEntry) => void
}) {
  const byMeal = new Map<Meal, PlanEntry[]>()
  for (const entry of entries) {
    byMeal.set(entry.meal, [...(byMeal.get(entry.meal) ?? []), entry])
  }
  // A meal the household stopped planning still shows if something's in it.
  const filled = MEALS.filter((meal) => byMeal.has(meal))
  const empty = meals.filter((meal) => !byMeal.has(meal))

  return (
    <section
      aria-label={`${dayName(date)}, ${monthDay(date)}`}
      className={cn(
        "grid gap-3 rounded-2xl border bg-card p-4 text-card-foreground",
        isToday && "border-primary ring-1 ring-primary",
        isPast && !isToday && "opacity-75"
      )}
    >
      <header className="flex items-baseline gap-2">
        <h2 className="text-lg font-semibold">{dayName(date)}</h2>
        <span className="text-sm text-muted-foreground">{monthDay(date)}</span>
        {isToday && <Badge className="self-center">Today</Badge>}
        <DayNutrition entries={entries} />
      </header>

      {filled.map((meal) => (
        <div key={meal} className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {MEAL_NAMES[meal]}
            </p>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Add to ${MEAL_NAMES[meal].toLowerCase()}`}
              onClick={() => onAdd(meal)}
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            </Button>
          </div>
          <ul className="grid gap-1">
            {byMeal.get(meal)!.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                onEdit={() => onEdit(entry)}
              />
            ))}
          </ul>
        </div>
      ))}

      {empty.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {empty.map((meal) => (
            <Button
              key={meal}
              variant="outline"
              size="sm"
              className="rounded-full border-dashed text-muted-foreground"
              onClick={() => onAdd(meal)}
            >
              <HugeiconsIcon
                icon={Add01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {MEAL_NAMES[meal]}
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}

/** One serving of each meal, added up: roughly what one person eats that day. */
function DayNutrition({ entries }: { entries: PlanEntry[] }) {
  const totals = planTotals(entries)
  if (!totals.counted) return null
  const partial = totals.counted < totals.meals
  return (
    <span
      className="ml-auto text-sm text-muted-foreground tabular-nums"
      title={`One serving of each meal: ${Math.round(totals.protein)} g protein, ${Math.round(totals.carbohydrates)} g carbs, ${Math.round(totals.fat)} g fat${partial ? `. ${totals.meals - totals.counted} without nutrition aren't counted.` : "."}`}
    >
      ≈ {Math.round(totals.calories).toLocaleString()} cal
      {partial && "+"}
    </span>
  )
}

function EntryRow({ entry, onEdit }: { entry: PlanEntry; onEdit: () => void }) {
  const [pairing, setPairing] = React.useState(false)
  const update = useUpdatePlanEntry()
  const remove = useRemovePlanEntry()
  const suggestOne = useSuggestMeal()
  const { setStatus: setEntryStatus } = useSetEntryStatus()
  const { recipe } = entry
  const servings = entry.servings ?? recipe?.servings ?? null
  const skipped = entry.status === "skipped"
  const cooked = entry.status === "cooked"
  const setStatus = (status: PlanEntry["status"], message: string) =>
    setEntryStatus(entry, status, message)

  /** Swaps in another recipe that suits the meal, with an undo. */
  function swap() {
    if (!recipe) return
    const onError = (error: unknown) =>
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't swap that"
      )
    suggestOne.mutate(
      { slots: [{ date: entry.date, meal: entry.meal }], exclude: [recipe.id] },
      {
        onSuccess: ([next]) => {
          if (!next) {
            toast("No other ideas for this one. More recipes, more variety.")
            return
          }
          update.mutate(
            { id: entry.id, recipeId: next.recipe.id },
            {
              onSuccess: () =>
                toast.success(`Swapped in ${next.recipe.name}`, {
                  action: {
                    label: "Undo",
                    onClick: () =>
                      update.mutate({
                        id: entry.id,
                        recipeId: recipe.id,
                        servings: entry.servings ?? undefined,
                      }),
                  },
                }),
              onError,
            }
          )
        },
        onError,
      }
    )
  }

  return (
    <li className="flex items-center gap-3 rounded-xl py-1">
      {recipe ? (
        <RecipeImage
          src={recipe.thumbnailUrl}
          alt=""
          className={cn("size-11 shrink-0 rounded-lg", skipped && "opacity-50")}
        />
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <HugeiconsIcon icon={Note01Icon} strokeWidth={2} className="size-5" />
        </span>
      )}
      <div className="grid min-w-0 flex-1 gap-0.5">
        {recipe ? (
          <Link
            to={`/recipes/${recipe.slug}${entry.with ? `?with=${entry.with.slug}` : ""}`}
            className={cn(
              "truncate font-medium hover:underline",
              skipped && "text-muted-foreground line-through"
            )}
          >
            {recipe.name}
            {entry.with && (
              <span className="font-normal text-muted-foreground">
                {" "}
                with {entry.with.name}
              </span>
            )}
          </Link>
        ) : (
          <span
            className={cn(
              "truncate font-medium",
              skipped && "text-muted-foreground line-through"
            )}
          >
            {entry.note}
          </span>
        )}
        <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          {cooked && (
            <span className="flex items-center gap-1 font-medium text-primary">
              <HugeiconsIcon
                icon={Tick02Icon}
                strokeWidth={2}
                className="size-3.5"
              />
              Cooked
            </span>
          )}
          {skipped && <span className="font-medium">Skipped</span>}
          {entry.listed && entry.status === "planned" && (
            <span title="Its ingredients are on the shopping list">
              On the list ·
            </span>
          )}
          {recipe &&
            [
              servings && `${servings} servings`,
              formatMinutes(recipe.totalMinutes),
            ]
              .filter(Boolean)
              .join(" · ")}
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Options for ${recipe?.name ?? entry.note}`}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {recipe && (
            <DropdownMenuItem asChild>
              <Link to={cookLink(entry)}>
                <HugeiconsIcon icon={CookingPotIcon} strokeWidth={2} />
                Start cooking
              </Link>
            </DropdownMenuItem>
          )}
          {recipe && entry.status === "planned" && (
            <DropdownMenuItem onSelect={swap}>
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} />
              Suggest something else
            </DropdownMenuItem>
          )}
          {entry.status !== "cooked" && recipe && (
            <DropdownMenuItem
              onSelect={() => setStatus("cooked", "Marked as cooked")}
            >
              Mark as cooked
            </DropdownMenuItem>
          )}
          {entry.status !== "skipped" && (
            <DropdownMenuItem onSelect={() => setStatus("skipped", "Skipped")}>
              Skip
            </DropdownMenuItem>
          )}
          {entry.status !== "planned" && (
            <DropdownMenuItem
              onSelect={() => setStatus("planned", "Back in the plan")}
            >
              Back to planned
            </DropdownMenuItem>
          )}
          {recipe && (
            <DropdownMenuItem onSelect={() => setPairing(true)}>
              {entry.with ? "Change what it goes with" : "Goes with…"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onEdit}>
            Move or change servings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              remove.mutate(entry.id, {
                onSuccess: () => toast("Removed from the plan"),
              })
            }
          >
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EntryPairingDialog
        entry={pairing ? entry : null}
        onClose={() => setPairing(false)}
      />
    </li>
  )
}
