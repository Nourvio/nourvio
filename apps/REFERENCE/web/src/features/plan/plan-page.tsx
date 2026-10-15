import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  Delete02Icon,
  MoreHorizontalIcon,
  ShoppingBasket01Icon,
  ShoppingBasketAdd01Icon,
  SparklesIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import {
  addDays,
  DEFAULT_MEALS,
  isoDate,
  planTotals,
  startOfWeek,
  costFor,
  costShown,
  weekdayOf,
  type Meal,
  type PlanBulkInput,
  type PlanEntry,
} from "@mise/shared"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useChatScreen } from "@/features/chat/chat-provider"
import { AddFromPlanDialog } from "@/features/list/add-from-plan-dialog"
import { useRecipeCosts } from "@/features/recipes/use-recipes"
import {
  SelectionBar,
  SelectionHeader,
  useSelectionKeepOnly,
} from "@/features/select/selection-bar"
import { undoable, useHidden } from "@/features/select/undo"
import { useSelection } from "@/features/select/use-selection"
import { useHouseholdInfo } from "@/features/settings/use-household"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

import { AddEntryDialog } from "./add-entry-dialog"
import { shortDayName, today, weekLabel } from "./dates"
import { DayCard, type EntrySelect } from "./day-card"
import { EditEntryDialog } from "./edit-entry-dialog"
import { FillWeekDialog } from "./fill-week-dialog"
import { MoveMealsDialog } from "./move-meals-dialog"
import { findNextMeal, NextMealCard, useMinute } from "./next-meal"
import { usePlan, usePlanBulk, useRepeatWeek } from "./use-plan"

const mealsCount = (n: number) => `${n} ${n === 1 ? "meal" : "meals"}`

/**
 * The week's meals: what's next, big, then a card for each day with its
 * meals side by side. Days gone by fold away. `?week=` holds the week's first day.
 */
export function PlanPage() {
  const household = useHouseholdInfo()
  const weekStart = household.data?.weekStart ?? 0
  const meals = household.data?.meals ?? DEFAULT_MEALS
  const [params, setParams] = useSearchParams()
  const minute = useMinute()
  const now = today()
  const thisWeek = startOfWeek(now, weekStart)
  const requested = isoDate.safeParse(params.get("week"))
  const start = requested.success
    ? startOfWeek(requested.data, weekStart)
    : thisWeek
  const end = addDays(start, 6)
  const plan = usePlan(start, end)
  // What's next can be in next week, so it looks a week ahead from today.
  const ahead = usePlan(now, addDays(now, 7))
  const [adding, setAdding] = React.useState<{
    date: string
    meal: Meal
  } | null>(null)
  const [editing, setEditing] = React.useState<PlanEntry | null>(null)
  const [listing, setListing] = React.useState(false)
  const [filling, setFilling] = React.useState(false)
  const [showPast, setShowPast] = React.useState(false)
  useChatScreen({ kind: "week", weekStart: start, weekLabel: weekLabel(start) })

  function goTo(week: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (week === thisWeek) next.delete("week")
        else next.set("week", week)
        return next
      },
      { replace: true, preventScrollReset: true }
    )
  }

  const isHidden = useHidden()
  const entries = (plan.data ?? []).filter((entry) => !isHidden(entry.id))
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const isThisWeek = start === thisWeek
  // This week, days gone by fold into a line; other weeks show every day.
  const past = isThisWeek ? days.filter((date) => date < now) : []
  const shownDays = days.filter((date) => showPast || !past.includes(date))

  // Select mode, over the meals on the days showing.
  const selection = useSelection()
  const bulk = usePlanBulk()
  const repeat = useRepeatWeek()
  const [moving, setMoving] = React.useState(false)
  const selectable = entries
    .filter((entry) => shownDays.includes(entry.date))
    .map((entry) => entry.id)
  useSelectionKeepOnly(selection, selectable)
  const pickedIds = selectable.filter((id) => selection.isPicked(id))
  const selectOf = (id: string): EntrySelect => ({
    selecting: selection.selecting,
    picked: selection.isPicked(id),
    onToggle: () => selection.toggle(id),
    onLongPress: () => selection.start(id),
  })
  // What "Clear the rest of the week" takes: meals still to come.
  const clearable = entries.filter(
    (entry) => entry.status === "planned" && (!isThisWeek || entry.date >= now)
  )

  const failed = (error: unknown) =>
    toast.error(error instanceof ApiError ? error.message : "That didn't work")

  /** Off the plan, with Undo. */
  function remove(ids: string[], message: string) {
    undoable({
      message,
      ids,
      commit: () => bulk.mutateAsync({ action: "delete", ids }),
    })
  }

  function run(input: PlanBulkInput, said: (changed: number) => string) {
    setMoving(false)
    bulk.mutate(input, {
      onSuccess: ({ changed }) => {
        toast.success(said(changed))
        selection.done()
      },
      onError: failed,
    })
  }

  function repeatLastWeek() {
    repeat.mutate(start, {
      onSuccess: (added) => {
        if (!added.length) {
          toast(
            "Nothing to bring over: last week was empty, or those days are full"
          )
          return
        }
        toast.success(
          `Brought over ${mealsCount(added.length)} from last week`,
          {
            duration: 10_000,
            action: {
              label: "Undo",
              onClick: () =>
                bulk.mutate({
                  action: "delete",
                  ids: added.map((entry) => entry.id),
                }),
            },
          }
        )
      },
      onError: failed,
    })
  }
  const next = isThisWeek ? findNextMeal(ahead.data ?? [], minute) : null
  const label = isThisWeek
    ? "This week"
    : start === addDays(thisWeek, 7)
      ? "Next week"
      : start === addDays(thisWeek, -7)
        ? "Last week"
        : null

  return (
    <>
      <PageHeader
        title="Plan"
        description={`${label ? `${label}, ` : ""}${weekLabel(start)}`}
        actions={
          selection.selecting ? (
            <SelectionHeader selection={selection} allIds={selectable} />
          ) : (
            <>
              <Button
                variant="outline"
                disabled={!plan.data || !household.data}
                onClick={() => setFilling(true)}
              >
                <HugeiconsIcon
                  icon={SparklesIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                Fill the week
              </Button>
              <Button onClick={() => setListing(true)}>
                <HugeiconsIcon
                  icon={ShoppingBasket01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                Add to list
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="More plan options"
                  >
                    <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    disabled={!selectable.length}
                    onSelect={() => selection.start()}
                  >
                    Select meals
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={repeat.isPending}
                    onSelect={repeatLastWeek}
                  >
                    Repeat last week
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={!clearable.length}
                    onSelect={() =>
                      remove(
                        clearable.map((entry) => entry.id),
                        `Cleared ${mealsCount(clearable.length)}`
                      )
                    }
                  >
                    {isThisWeek
                      ? "Clear the rest of the week"
                      : "Clear the week"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />

      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              aria-label="Previous week"
              onClick={() => goTo(addDays(start, -7))}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
            </Button>
            <span className="min-w-28 text-center font-semibold">
              {weekLabel(start)}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              aria-label="Next week"
              onClick={() => goTo(addDays(start, 7))}
            >
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
            </Button>
            {!isThisWeek && (
              <Button variant="ghost" size="sm" onClick={() => goTo(thisWeek)}>
                This week
              </Button>
            )}
          </div>
          {plan.data && (
            <WeekSummary
              days={days}
              meals={meals}
              entries={entries}
              budget={household.data?.weeklyBudget ?? null}
              onList={() => setListing(true)}
            />
          )}
        </div>

        {next && <NextMealCard entry={next} onEdit={() => setEditing(next)} />}

        {plan.isPending || household.isPending ? (
          <div className="grid gap-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-36 rounded-3xl" />
            ))}
          </div>
        ) : plan.isError ? (
          <p className="text-muted-foreground">Couldn't load the plan.</p>
        ) : (
          <>
            {past.length > 0 && (
              <PastDays
                days={past}
                entries={entries.filter((entry) => entry.date < now)}
                open={showPast}
                onToggle={() => setShowPast((open) => !open)}
              />
            )}
            {shownDays.map((date) => (
              <DayCard
                key={date}
                date={date}
                isToday={date === now}
                isPast={date < now}
                meals={meals}
                entries={entries.filter((entry) => entry.date === date)}
                onAdd={(meal) => setAdding({ date, meal })}
                onEdit={setEditing}
                selectOf={selectOf}
                theme={
                  meals.includes("dinner")
                    ? (household.data?.themes[weekdayOf(date)] ?? null)
                    : null
                }
              />
            ))}
          </>
        )}
      </div>

      <SelectionBar
        selection={selection}
        actions={[
          {
            label: "Move",
            icon: Calendar03Icon,
            onSelect: () => setMoving(true),
          },
          {
            label: "Add to list",
            icon: ShoppingBasketAdd01Icon,
            onSelect: () =>
              run({ action: "toList", ids: pickedIds }, (changed) =>
                changed
                  ? `${changed} ${changed === 1 ? "thing" : "things"} on the list`
                  : "Those are on the list already"
              ),
          },
          {
            label: "Cooked",
            icon: Tick02Icon,
            onSelect: () =>
              run(
                { action: "status", ids: pickedIds, status: "cooked" },
                (changed) => `Marked ${mealsCount(changed)} cooked`
              ),
          },
          {
            label: "Remove",
            icon: Delete02Icon,
            destructive: true,
            onSelect: () => {
              remove(
                pickedIds,
                `Removed ${mealsCount(pickedIds.length)} from the plan`
              )
              selection.done()
            },
          },
        ]}
        more={[
          {
            label: "Skip",
            onSelect: () =>
              run(
                { action: "status", ids: pickedIds, status: "skipped" },
                (changed) => `Skipped ${mealsCount(changed)}`
              ),
          },
          {
            label: "Back to planned",
            onSelect: () =>
              run(
                { action: "status", ids: pickedIds, status: "planned" },
                (changed) => `${mealsCount(changed)} back in the plan`
              ),
          },
        ]}
      />
      <MoveMealsDialog
        count={pickedIds.length}
        start={start}
        meals={meals}
        open={moving}
        onOpenChange={setMoving}
        onPick={(date, meal) =>
          run(
            { action: "move", ids: pickedIds, date, meal },
            (changed) => `Moved ${mealsCount(changed)} to ${shortDayName(date)}`
          )
        }
      />
      <AddEntryDialog slot={adding} onClose={() => setAdding(null)} />
      <FillWeekDialog
        open={filling}
        onOpenChange={setFilling}
        days={days}
        meals={meals}
        entries={entries}
      />
      <AddFromPlanDialog
        open={listing}
        onOpenChange={setListing}
        initialWeek={start}
      />
      <EditEntryDialog
        entry={editing}
        meals={meals}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

/** How full the week is, what still needs adding to the list, and calories a day. */
function WeekSummary({
  days,
  meals,
  entries,
  budget,
  onList,
}: {
  days: string[]
  meals: Meal[]
  entries: PlanEntry[]
  budget: number | null
  onList: () => void
}) {
  const now = today()
  const costs = useRecipeCosts().data
  // What the week's meals cost, sides included, as far as they're priced.
  const week = costs
    ? entries.reduce(
        (sum, entry) => {
          if (!entry.recipe || entry.status === "skipped") return sum
          const main = costFor(
            costShown(costs[entry.recipe.id]),
            entry.servings,
            entry.recipe.servings
          )
          const side = entry.with
            ? costFor(
                costShown(costs[entry.with.id]),
                entry.servings,
                entry.with.servings
              )
            : 0
          return {
            total: sum.total + (main ?? 0) + (side ?? 0),
            missing: sum.missing + (main === null ? 1 : 0),
          }
        },
        { total: 0, missing: 0 }
      )
    : null
  const filled = new Set(
    entries
      .filter((entry) => meals.includes(entry.meal))
      .map((entry) => `${entry.date}|${entry.meal}`)
  ).size
  const coming = entries.filter(
    (entry) => entry.recipe && entry.status === "planned" && entry.date >= now
  )
  const unlisted = coming.filter((entry) => !entry.listed).length
  // The average over days with something counted, per person.
  const dayTotals = days
    .map((date) => planTotals(entries.filter((entry) => entry.date === date)))
    .filter((totals) => totals.counted)
  const perDay = dayTotals.length
    ? Math.round(
        dayTotals.reduce((sum, totals) => sum + totals.calories, 0) /
          dayTotals.length
      )
    : null
  const chip = "rounded-full bg-secondary px-3 py-1 text-sm"

  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={chip}>
        <strong className="font-semibold">{filled}</strong> of{" "}
        {meals.length * days.length} meals planned
      </span>
      {unlisted > 0 ? (
        <button
          type="button"
          onClick={onList}
          className={`${chip} font-medium text-primary transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50`}
        >
          {unlisted} not on the list yet
        </button>
      ) : (
        coming.length > 0 && <span className={chip}>All on the list</span>
      )}
      {perDay && (
        <span className={chip}>
          ≈ <strong className="font-semibold">{perDay.toLocaleString()}</strong>{" "}
          cal a day
        </span>
      )}
      {week && week.total > 0 && (
        <span
          className={cn(
            chip,
            budget !== null &&
              week.total > budget &&
              "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          )}
          title={
            week.missing
              ? `${week.missing} planned ${week.missing === 1 ? "meal has" : "meals have"} no price yet`
              : undefined
          }
        >
          ≈{" "}
          <strong className="font-semibold">
            {week.total.toLocaleString(undefined, {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            })}
          </strong>
          {budget !== null
            ? ` of your ${budget.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`
            : " for the week"}
          {week.missing > 0 && "+"}
        </span>
      )}
    </div>
  )
}

/** This week's days gone by, folded into one line until they're wanted. */
function PastDays({
  days,
  entries,
  open,
  onToggle,
}: {
  days: string[]
  entries: PlanEntry[]
  open: boolean
  onToggle: () => void
}) {
  const range =
    days.length > 1
      ? `${shortDayName(days[0]!)} – ${shortDayName(days.at(-1)!)}`
      : shortDayName(days[0]!)
  const cooked = entries.filter((entry) => entry.status === "cooked")
  const names = cooked.map((entry) => entry.recipe?.name ?? entry.note)
  const summary = cooked.length
    ? `${cooked.length} cooked: ${names.join(", ")}`
    : entries.length
      ? `${entries.length} planned, none marked cooked`
      : "Nothing was planned"

  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex items-center justify-between gap-4 rounded-3xl border bg-muted/40 px-5 py-3.5 text-left transition-colors outline-none hover:bg-muted/70 focus-visible:ring-[3px] focus-visible:ring-ring/50 md:px-6"
    >
      <span className="min-w-0 truncate text-muted-foreground">
        <span className="font-semibold text-foreground">{range}</span> ·{" "}
        {summary}
      </span>
      <span className="shrink-0 text-sm font-semibold text-primary">
        {open ? "Hide" : "Show"}
      </span>
    </button>
  )
}
