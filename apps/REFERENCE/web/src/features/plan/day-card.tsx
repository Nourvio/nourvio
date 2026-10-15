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
  themeLabel,
  type Meal,
  type NightTheme,
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
import { SelectMark } from "@/features/select/select-mark"
import { useLongPress } from "@/features/select/use-selection"
import { cn } from "@/lib/utils"

import { cookLink } from "./cook-link"
import { dayName, monthDay } from "./dates"
import { EntryPairingDialog } from "./entry-pairing-dialog"
import { useRemovePlanEntry, useSetEntryStatus, useSwapEntry } from "./use-plan"

/** A meal's part in select mode on the Plan. */
export type EntrySelect = {
  selecting: boolean
  picked: boolean
  onToggle: () => void
  /** A long press on a phone, which starts selecting with this one. */
  onLongPress: () => void
}

/**
 * One day of the plan, full width, with its meals side by side when there's
 * room. Empty meals are a "+ Add lunch" box in their place; on a narrow card
 * they shrink to small buttons after what's planned.
 */
export function DayCard({
  date,
  isToday,
  isPast,
  meals,
  entries,
  onAdd,
  onEdit,
  theme = null,
  selectOf,
}: {
  date: string
  isToday: boolean
  isPast: boolean
  meals: Meal[]
  entries: PlanEntry[]
  onAdd: (meal: Meal) => void
  onEdit: (entry: PlanEntry) => void
  /** The night's theme, for dinner. */
  theme?: NightTheme | null
  selectOf?: (id: string) => EntrySelect
}) {
  const id = React.useId()
  const byMeal = new Map<Meal, PlanEntry[]>()
  for (const entry of entries) {
    byMeal.set(entry.meal, [...(byMeal.get(entry.meal) ?? []), entry])
  }
  // A meal the household stopped planning still shows if something's in it.
  const shown = MEALS.filter((meal) => meals.includes(meal) || byMeal.has(meal))

  return (
    <section
      aria-labelledby={id}
      className={cn(
        "@container grid gap-3.5 rounded-3xl border bg-card p-5 text-card-foreground md:px-6",
        isToday && "border-primary ring-1 ring-primary",
        isPast && !isToday && "opacity-75"
      )}
    >
      <header className="flex items-baseline gap-2.5">
        <h2 id={id} className="text-xl font-semibold tracking-tight">
          {dayName(date)}
        </h2>
        <span className="text-sm text-muted-foreground">{monthDay(date)}</span>
        {isToday && <Badge className="self-center">Today</Badge>}
        {theme && (
          <span className="self-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            {themeLabel(theme)}
          </span>
        )}
        <DayNutrition entries={entries} />
      </header>

      <div
        className="flex flex-wrap gap-2 @2xl:grid @2xl:grid-cols-(--meal-columns) @2xl:gap-3"
        style={
          {
            "--meal-columns": `repeat(${shown.length}, minmax(0, 1fr))`,
          } as React.CSSProperties
        }
      >
        {shown.map((meal) =>
          byMeal.has(meal) ? (
            <div key={meal} className="grid basis-full content-start gap-1.5">
              <div className="flex h-6 items-center justify-between">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {MEAL_NAMES[meal]}
                </p>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Add another to ${MEAL_NAMES[meal].toLowerCase()}`}
                  onClick={() => onAdd(meal)}
                >
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                </Button>
              </div>
              <ul className="grid gap-1.5">
                {byMeal.get(meal)!.map((entry) => (
                  <EntryTile
                    key={entry.id}
                    entry={entry}
                    onEdit={() => onEdit(entry)}
                    select={selectOf?.(entry.id)}
                  />
                ))}
              </ul>
            </div>
          ) : (
            <div
              key={meal}
              className="order-last grid content-start gap-1.5 @2xl:order-none"
            >
              <p className="hidden h-6 text-xs leading-6 font-semibold tracking-wide text-muted-foreground uppercase @2xl:block">
                {MEAL_NAMES[meal]}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-dashed bg-transparent text-muted-foreground @2xl:h-17 @2xl:w-full @2xl:rounded-2xl"
                onClick={() => onAdd(meal)}
              >
                <HugeiconsIcon
                  icon={Add01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                <span className="@2xl:hidden">{MEAL_NAMES[meal]}</span>
                <span className="hidden @2xl:inline">
                  Add {MEAL_NAMES[meal].toLowerCase()}
                </span>
              </Button>
            </div>
          )
        )}
      </div>
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

/** A planned meal: its photo, name and what's worth knowing, with everything else in a menu. */
function EntryTile({
  entry,
  onEdit,
  select,
}: {
  entry: PlanEntry
  onEdit: () => void
  select?: EntrySelect
}) {
  const selecting = select?.selecting ?? false
  const press = useLongPress(
    () => select?.onLongPress(),
    Boolean(select && !selecting)
  )
  const [pairing, setPairing] = React.useState(false)
  const remove = useRemovePlanEntry()
  const { swap } = useSwapEntry()
  const { setStatus: setEntryStatus } = useSetEntryStatus()
  const { recipe } = entry
  const servings = entry.servings ?? recipe?.servings ?? null
  const skipped = entry.status === "skipped"
  const cooked = entry.status === "cooked"
  const setStatus = (status: PlanEntry["status"], message: string) =>
    setEntryStatus(entry, status, message)

  if (selecting) {
    return (
      <li>
        <button
          type="button"
          onClick={select?.onToggle}
          aria-pressed={select?.picked}
          className={cn(
            "flex min-h-17 w-full items-center gap-3 rounded-2xl bg-muted/50 p-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            select?.picked && "bg-accent ring-2 ring-primary"
          )}
        >
          <SelectMark picked={select?.picked ?? false} className="shrink-0" />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span
              className={cn(
                "truncate font-medium",
                skipped && "text-muted-foreground line-through"
              )}
            >
              {recipe?.name ?? entry.note}
              {entry.with && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  with {entry.with.name}
                </span>
              )}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {cooked ? "Cooked" : skipped ? "Skipped" : "Planned"}
              {entry.listed && entry.status === "planned" && " · On the list"}
            </span>
          </span>
        </button>
      </li>
    )
  }

  return (
    <li
      className="flex min-h-17 items-center gap-3 rounded-2xl bg-muted/50 p-2.5"
      {...press}
    >
      {recipe ? (
        <RecipeImage
          src={recipe.thumbnailUrl}
          alt=""
          className={cn("size-12 shrink-0 rounded-xl", skipped && "opacity-50")}
        />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
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
          {recipe
            ? [
                servings && `${servings} servings`,
                formatMinutes(recipe.totalMinutes),
              ]
                .filter(Boolean)
                .join(" · ")
            : !cooked && !skipped && "A note"}
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
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
            <DropdownMenuItem onSelect={() => swap(entry)}>
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} />
              Something else
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
